//! PostgreSQL is canonical. No in-memory conversation is treated as durable.
use crate::{config::private_file, protocol::*};
use anyhow::{Result, ensure};
use chrono::Utc;
use serde_json::{Value, json};
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
use std::path::Path;
use uuid::Uuid;

#[derive(Clone)]
pub struct Store {
    pub pool: PgPool,
    pub(crate) confluence_slots: std::sync::Arc<tokio::sync::Semaphore>,
}
pub enum Claim {
    Started,
    Existing(String),
}

impl Store {
    pub async fn open(file: &Path) -> Result<Self> {
        let dsn = private_file(file)?;
        let url = reqwest::Url::parse(&dsn)?;
        ensure!(
            matches!(url.scheme(), "postgres" | "postgresql")
                && url.path().starts_with("/earth_intelligence_")
                && matches!(url.host_str(), Some("127.0.0.1" | "[::1]"))
                && url.query().is_none(),
            "Use a dedicated local earth_intelligence_* database"
        );
        let pool = PgPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(std::time::Duration::from_secs(3))
            .after_connect(|connection, _| {
                Box::pin(async move {
                    sqlx::query("SET statement_timeout='5s'")
                        .execute(&mut *connection)
                        .await?;
                    sqlx::query("SET lock_timeout='2s'")
                        .execute(&mut *connection)
                        .await?;
                    Ok(())
                })
            })
            .connect(&dsn)
            .await?;
        let role = sqlx::query("SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user").fetch_one(&pool).await?;
        ensure!(
            !role.get::<bool, _>("rolsuper")
                && !role.get::<bool, _>("rolbypassrls")
                && !role.get::<bool, _>("rolcreatedb")
                && !role.get::<bool, _>("rolcreaterole"),
            "Runtime requires an unprivileged database role"
        );
        sqlx::query("SELECT id FROM earth_intelligence.sessions LIMIT 0")
            .execute(&pool)
            .await?;
        Ok(Self {
            pool,
            confluence_slots: std::sync::Arc::new(tokio::sync::Semaphore::new(2)),
        })
    }

    pub async fn create(&self, owner: &str, input: NewSession) -> Result<Session> {
        ensure!(
            !input.title.trim().is_empty() && input.title.len() <= 120,
            "Session title budget"
        );
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(hashtext($1))")
            .bind(owner)
            .execute(&mut *tx)
            .await?;
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM earth_intelligence.sessions WHERE owner=$1")
                .bind(owner)
                .fetch_one(&mut *tx)
                .await?;
        ensure!(count < 128, "Session retention quota reached");
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO earth_intelligence.sessions(id,owner,title,mode) VALUES($1,$2,$3,$4)",
        )
        .bind(id)
        .bind(owner)
        .bind(input.title)
        .bind(serde_json::to_value(input.mode)?.as_str().unwrap())
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        self.append(
            owner,
            id,
            Uuid::new_v4(),
            EventBody::SessionStarted { mode: input.mode },
        )
        .await?;
        self.session(owner, id).await
    }

    pub async fn session(&self, owner: &str, id: Uuid) -> Result<Session> {
        let row = sqlx::query("SELECT id,title,mode,status,created_at,updated_at,cursor FROM earth_intelligence.sessions WHERE id=$1 AND owner=$2")
            .bind(id).bind(owner).fetch_optional(&self.pool).await?.ok_or_else(|| anyhow::anyhow!("Session unavailable"))?;
        Self::row_session(row)
    }
    fn row_session(row: sqlx::postgres::PgRow) -> Result<Session> {
        Ok(Session {
            id: row.get("id"),
            title: row.get("title"),
            mode: serde_json::from_value(json!(row.get::<String, _>("mode")))?,
            status: row.get("status"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
            cursor: row.get("cursor"),
        })
    }
    pub async fn sessions(&self, owner: &str) -> Result<Vec<Session>> {
        let rows = sqlx::query("SELECT id,title,mode,status,created_at,updated_at,cursor FROM earth_intelligence.sessions WHERE owner=$1 ORDER BY updated_at DESC LIMIT 128").bind(owner).fetch_all(&self.pool).await?;
        rows.into_iter().map(Self::row_session).collect()
    }

    pub async fn append(
        &self,
        owner: &str,
        id: Uuid,
        request: Uuid,
        body: EventBody,
    ) -> Result<Event> {
        let mut tx = self.pool.begin().await?;
        let row = sqlx::query("SELECT cursor,event_bytes FROM earth_intelligence.sessions WHERE id=$1 AND owner=$2 FOR UPDATE")
            .bind(id).bind(owner).fetch_optional(&mut *tx).await?.ok_or_else(|| anyhow::anyhow!("Session unavailable"))?;
        let sequence = row.get::<i64, _>("cursor") + 1;
        let event = Event {
            protocol_version: PROTOCOL.into(),
            session_id: id,
            sequence,
            request_id: request,
            timestamp: Utc::now(),
            body,
        };
        // Streaming cannot consume the space needed for durable failure/cancel
        // receipts; otherwise a full session would leave an SSE client waiting.
        if matches!(&event.body, EventBody::MessageDelta { .. }) {
            ensure!(
                sequence <= 4032
                    && row.get::<i64, _>("event_bytes") + serde_json::to_vec(&event)?.len() as i64
                        <= 8 * 1024 * 1024 - 65536,
                "Narrative event budget reached"
            );
        }
        let value = serde_json::to_value(&event)?;
        let bytes = serde_json::to_vec(&value)?.len() as i64;
        ensure!(
            bytes <= 12000
                && sequence <= 4096
                && row.get::<i64, _>("event_bytes") + bytes <= 8 * 1024 * 1024,
            "Session event budget reached"
        );
        sqlx::query(
            "INSERT INTO earth_intelligence.events(session_id,sequence,event) VALUES($1,$2,$3)",
        )
        .bind(id)
        .bind(sequence)
        .bind(value)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE earth_intelligence.sessions SET cursor=$1,event_bytes=event_bytes+$2,updated_at=now() WHERE id=$3 AND owner=$4")
            .bind(sequence).bind(bytes).bind(id).bind(owner).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(event)
    }

    pub async fn events(&self, owner: &str, id: Uuid, after: i64) -> Result<Vec<Event>> {
        let session = self.session(owner, id).await?;
        ensure!(
            (0..=session.cursor).contains(&after),
            "Invalid event cursor"
        );
        let rows: Vec<Value> = sqlx::query_scalar("SELECT e.event FROM earth_intelligence.events e JOIN earth_intelligence.sessions s ON s.id=e.session_id WHERE e.session_id=$1 AND s.owner=$2 AND e.sequence>$3 ORDER BY e.sequence LIMIT 256")
            .bind(id).bind(owner).bind(after).fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|value| Ok(serde_json::from_value(value)?))
            .collect()
    }
    pub async fn conversation(&self, owner: &str, id: Uuid, current: Uuid) -> Result<Value> {
        self.session(owner, id).await?;
        let rows:Vec<Value>=sqlx::query_scalar("SELECT e.event FROM earth_intelligence.events e JOIN earth_intelligence.sessions s ON s.id=e.session_id WHERE s.id=$1 AND s.owner=$2 AND e.event->>'request_id'<>$3 AND e.event->>'type' IN ('message.started','message.delta') ORDER BY e.sequence LIMIT 4096")
            .bind(id).bind(owner).bind(current.to_string()).fetch_all(&self.pool).await?;
        let mut messages: Vec<Value> = Vec::new();
        for event in rows {
            if event["type"] == "message.started" {
                messages.push(json!({"role":"user","text":event["data"]["user_text"]}));
            } else if let Some(text) = event["data"]["text"].as_str() {
                if messages.last().is_none_or(|m| m["role"] != "assistant") {
                    messages.push(json!({"role":"assistant","text":""}));
                }
                let previous = messages.last().unwrap()["text"].as_str().unwrap_or("");
                let combined = format!("{previous}{text}");
                messages.last_mut().unwrap()["text"] = json!(combined);
            }
        }
        while serde_json::to_vec(&messages)?.len() > 16384 {
            if messages.len() > 1 {
                messages.remove(0);
            } else {
                let last = messages[0]["text"]
                    .as_str()
                    .unwrap_or("")
                    .chars()
                    .rev()
                    .take(2000)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<String>();
                messages[0]["text"] = json!(last);
                break;
            }
        }
        Ok(json!(messages))
    }

    pub async fn claim(&self, owner: &str, id: Uuid, message: &Message) -> Result<Claim> {
        self.claim_context(owner, id, message, None).await
    }
    pub(crate) async fn claim_context(
        &self,
        owner: &str,
        id: Uuid,
        message: &Message,
        context: Option<&Value>,
    ) -> Result<Claim> {
        let hash = match context {
            Some(context) => digest(&serde_json::to_vec(
                &json!({"message":message,"context":context}),
            )?),
            None => digest(&serde_json::to_vec(message)?),
        };
        let mut tx = self.pool.begin().await?;
        let state = sqlx::query(
            "SELECT status,cursor,event_bytes FROM earth_intelligence.sessions WHERE id=$1 AND owner=$2 FOR UPDATE",
        )
        .bind(id)
        .bind(owner)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Session unavailable"))?;
        if let Some(row) = sqlx::query("SELECT input_sha256,status FROM earth_intelligence.requests WHERE session_id=$1 AND request_id=$2")
            .bind(id).bind(message.request_id).fetch_optional(&mut *tx).await? {
            ensure!(row.get::<String,_>("input_sha256") == hash, "Idempotency key reused with different input");
            return Ok(Claim::Existing(row.get("status")));
        }
        ensure!(
            state.get::<String, _>("status") == "idle",
            "Session is busy or awaiting approval"
        );
        ensure!(
            state.get::<i64, _>("cursor") < 4000
                && state.get::<i64, _>("event_bytes") < 8 * 1024 * 1024 - 262144,
            "Session capacity reached; export and start a new session"
        );
        sqlx::query("INSERT INTO earth_intelligence.requests(session_id,request_id,input_sha256,status) VALUES($1,$2,$3,'running')")
            .bind(id).bind(message.request_id).bind(hash).execute(&mut *tx).await?;
        sqlx::query("UPDATE earth_intelligence.sessions SET status='running',updated_at=now() WHERE id=$1 AND owner=$2").bind(id).bind(owner).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(Claim::Started)
    }

    pub async fn finish(&self, owner: &str, id: Uuid, request: Uuid, status: &str) -> Result<()> {
        ensure!(
            ["completed", "cancelled", "failed", "awaiting_approval"].contains(&status),
            "Invalid request state"
        );
        let mut tx = self.pool.begin().await?;
        let updated = sqlx::query("UPDATE earth_intelligence.sessions SET status=$1,updated_at=now() WHERE id=$2 AND owner=$3")
            .bind(if status == "awaiting_approval" { "awaiting_approval" } else { "idle" }).bind(id).bind(owner).execute(&mut *tx).await?;
        ensure!(updated.rows_affected() == 1, "Session unavailable");
        sqlx::query("UPDATE earth_intelligence.requests SET status=$1 WHERE session_id=$2 AND request_id=$3").bind(status).bind(id).bind(request).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn propose(
        &self,
        owner: &str,
        id: Uuid,
        request: Uuid,
        tool: Tool,
    ) -> Result<Proposal> {
        self.session(owner, id).await?;
        let value = serde_json::to_value(&tool)?;
        let bytes = serde_json::to_vec(&value)?;
        ensure!(bytes.len() <= 96000, "Proposal byte budget");
        let proposal = Proposal {
            id: Uuid::new_v4(),
            session_id: id,
            request_id: request,
            sha256: digest(&bytes),
            tool,
            status: "pending".into(),
            created_at: Utc::now(),
        };
        sqlx::query("INSERT INTO earth_intelligence.proposals(id,session_id,request_id,sha256,tool) VALUES($1,$2,$3,$4,$5)")
            .bind(proposal.id).bind(id).bind(request).bind(&proposal.sha256).bind(value).execute(&self.pool).await?;
        Ok(proposal)
    }

    pub async fn pending(&self, owner: &str, id: Uuid) -> Result<Vec<Proposal>> {
        self.session(owner, id).await?;
        let rows = sqlx::query("SELECT p.* FROM earth_intelligence.proposals p JOIN earth_intelligence.sessions s ON s.id=p.session_id WHERE p.session_id=$1 AND s.owner=$2 AND p.status='pending' ORDER BY p.created_at LIMIT 4")
            .bind(id).bind(owner).fetch_all(&self.pool).await?;
        rows.into_iter().map(Self::row_proposal).collect()
    }
    fn row_proposal(row: sqlx::postgres::PgRow) -> Result<Proposal> {
        Ok(Proposal {
            id: row.get("id"),
            session_id: row.get("session_id"),
            request_id: row.get("request_id"),
            sha256: row.get("sha256"),
            tool: serde_json::from_value(row.get("tool"))?,
            status: row.get("status"),
            created_at: row.get("created_at"),
        })
    }

    pub async fn approve(&self, owner: &str, id: Uuid, approval: &Approval) -> Result<Proposal> {
        let mut tx = self.pool.begin().await?;
        let status: String = sqlx::query_scalar(
            "SELECT status FROM earth_intelligence.sessions WHERE id=$1 AND owner=$2 FOR UPDATE",
        )
        .bind(id)
        .bind(owner)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Session unavailable"))?;
        ensure!(status == "awaiting_approval", "No pending approval");
        let row = sqlx::query("UPDATE earth_intelligence.proposals SET status='executing' WHERE id=$1 AND session_id=$2 AND sha256=$3 AND status='pending' AND created_at>now()-interval '10 minutes' RETURNING *")
            .bind(approval.proposal_id).bind(id).bind(&approval.sha256).fetch_optional(&mut *tx).await?.ok_or_else(|| anyhow::anyhow!("Approval missing, consumed, changed or expired"))?;
        sqlx::query(
            "UPDATE earth_intelligence.sessions SET status='running' WHERE id=$1 AND owner=$2",
        )
        .bind(id)
        .bind(owner)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Self::row_proposal(row)
    }

    pub async fn proposal_done(
        &self,
        owner: &str,
        id: Uuid,
        proposal: Uuid,
        outcome: &str,
    ) -> Result<()> {
        ensure!(
            ["completed", "unknown", "revoked"].contains(&outcome),
            "Invalid outcome"
        );
        sqlx::query("UPDATE earth_intelligence.proposals p SET status=$1 FROM earth_intelligence.sessions s WHERE p.id=$2 AND p.session_id=$3 AND s.id=p.session_id AND s.owner=$4")
            .bind(outcome).bind(proposal).bind(id).bind(owner).execute(&self.pool).await?;
        Ok(())
    }

    pub async fn revoke_request(&self, owner: &str, id: Uuid, request: Uuid) -> Result<()> {
        sqlx::query("UPDATE earth_intelligence.proposals p SET status='revoked' FROM earth_intelligence.sessions s WHERE p.session_id=$1 AND p.request_id=$2 AND p.status='pending' AND s.id=p.session_id AND s.owner=$3")
            .bind(id).bind(request).bind(owner).execute(&self.pool).await?;
        Ok(())
    }
    pub async fn artifact_capacity(&self, owner: &str, id: Uuid, needed: i64) -> Result<()> {
        self.session(owner, id).await?;
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM earth_intelligence.artifacts WHERE session_id=$1",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        ensure!(
            count + needed <= 32,
            "Artifact quota reached before tool execution"
        );
        Ok(())
    }
    pub async fn artifact(&self, owner: &str, id: Uuid, kind: &str, body: Value) -> Result<Uuid> {
        self.session(owner, id).await?;
        ensure!(
            serde_json::to_vec(&body)?.len() <= 1_900_000,
            "Artifact byte budget"
        );
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM earth_intelligence.artifacts WHERE session_id=$1",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await?;
        ensure!(count < 32, "Artifact quota reached");
        let artifact = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO earth_intelligence.artifacts(id,session_id,kind,body) VALUES($1,$2,$3,$4)",
        )
        .bind(artifact)
        .bind(id)
        .bind(kind)
        .bind(body)
        .execute(&self.pool)
        .await?;
        Ok(artifact)
    }

    pub async fn latest_workspace(&self, owner: &str, id: Uuid) -> Result<(Uuid, Value)> {
        let row = sqlx::query("SELECT a.id,a.body FROM earth_intelligence.artifacts a JOIN earth_intelligence.sessions s ON s.id=a.session_id WHERE s.id=$1 AND s.owner=$2 AND a.kind='spatial_workspace' AND EXISTS(SELECT 1 FROM earth_intelligence.events e WHERE e.session_id=s.id AND e.event->>'type'='workspace.updated' AND e.event->'data'->>'artifact_id'=a.id::text) ORDER BY a.created_at DESC LIMIT 1")
            .bind(id).bind(owner).fetch_optional(&self.pool).await?.ok_or_else(|| anyhow::anyhow!("Workspace unavailable"))?;
        Ok((row.get("id"), row.get("body")))
    }

    pub async fn share(&self, owner: &str, id: Uuid) -> Result<String> {
        let (artifact, _) = self.latest_workspace(owner, id).await?;
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        sqlx::query("INSERT INTO earth_intelligence.shares(token_sha256,session_id,artifact_id,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')")
            .bind(digest(token.as_bytes())).bind(id).bind(artifact).execute(&self.pool).await?;
        Ok(token)
    }
    pub async fn shared_workspace(&self, token: &str) -> Result<Value> {
        ensure!(token.len() == 64, "Share unavailable");
        let value: Option<Value> = sqlx::query_scalar("SELECT a.body FROM earth_intelligence.shares sh JOIN earth_intelligence.artifacts a ON a.id=sh.artifact_id WHERE sh.token_sha256=$1 AND sh.expires_at>now() AND a.kind='spatial_workspace'")
            .bind(digest(token.as_bytes())).fetch_optional(&self.pool).await?;
        value.ok_or_else(|| anyhow::anyhow!("Share unavailable"))
    }
    pub async fn shared_events(&self, token: &str) -> Result<Vec<Event>> {
        self.shared_workspace(token).await?;
        let rows:Vec<Value>=sqlx::query_scalar("SELECT e.event FROM earth_intelligence.shares sh JOIN earth_intelligence.events e ON e.session_id=sh.session_id WHERE sh.token_sha256=$1 AND sh.expires_at>now() AND e.event->>'type'='workspace.updated' AND e.event->'data'->>'artifact_id'=sh.artifact_id::text ORDER BY e.sequence LIMIT 1")
            .bind(digest(token.as_bytes())).fetch_all(&self.pool).await?;
        rows.into_iter()
            .map(|value| Ok(serde_json::from_value(value)?))
            .collect()
    }
    pub async fn revoke(&self, owner: &str, id: Uuid) -> Result<()> {
        self.session(owner, id).await?;
        sqlx::query("DELETE FROM earth_intelligence.shares WHERE session_id=$1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn cancel_pending(&self, owner: &str, id: Uuid) -> Result<Vec<Uuid>> {
        let mut tx = self.pool.begin().await?;
        let status: Option<String> = sqlx::query_scalar(
            "SELECT status FROM earth_intelligence.sessions WHERE id=$1 AND owner=$2 FOR UPDATE",
        )
        .bind(id)
        .bind(owner)
        .fetch_optional(&mut *tx)
        .await?;
        ensure!(
            status.as_deref() == Some("awaiting_approval"),
            "Approval state changed; retry cancellation"
        );
        let requests:Vec<Uuid>=sqlx::query_scalar("UPDATE earth_intelligence.proposals SET status='revoked' WHERE session_id=$1 AND status='pending' RETURNING request_id").bind(id).fetch_all(&mut *tx).await?;
        sqlx::query("UPDATE earth_intelligence.requests SET status='cancelled' WHERE session_id=$1 AND status='awaiting_approval'").bind(id).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE earth_intelligence.sessions SET status='idle' WHERE id=$1 AND owner=$2",
        )
        .bind(id)
        .bind(owner)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(requests)
    }
    pub async fn artifacts(&self, owner: &str, id: Uuid) -> Result<Vec<Value>> {
        self.session(owner, id).await?;
        let rows=sqlx::query("SELECT a.id,a.kind,a.created_at FROM earth_intelligence.artifacts a JOIN earth_intelligence.sessions s ON s.id=a.session_id WHERE s.id=$1 AND s.owner=$2 ORDER BY a.created_at LIMIT 32").bind(id).bind(owner).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(|row|json!({"id":row.get::<Uuid,_>("id"),"kind":row.get::<String,_>("kind"),"created_at":row.get::<chrono::DateTime<Utc>,_>("created_at")})).collect())
    }
    pub async fn artifact_body(&self, owner: &str, id: Uuid, artifact: Uuid) -> Result<Value> {
        sqlx::query_scalar("SELECT a.body FROM earth_intelligence.artifacts a JOIN earth_intelligence.sessions s ON s.id=a.session_id WHERE s.id=$1 AND s.owner=$2 AND a.id=$3")
            .bind(id).bind(owner).bind(artifact).fetch_optional(&self.pool).await?.ok_or_else(||anyhow::anyhow!("Artifact unavailable"))
    }

    pub async fn test_context(&self, owner: &str, id: Uuid, artifact: Uuid) -> Result<Value> {
        let value:Value=sqlx::query_scalar("SELECT a.body FROM earth_intelligence.artifacts a JOIN earth_intelligence.sessions s ON s.id=a.session_id WHERE s.id=$1 AND s.owner=$2 AND a.id=$3 AND a.kind='test_receipt'")
            .bind(id).bind(owner).bind(artifact).fetch_optional(&self.pool).await?.ok_or_else(||anyhow::anyhow!("Test receipt unavailable"))?;
        let result = &value["result"];
        Ok(
            json!({"artifact_id":artifact,"receipt":value["receipt"],"exit_code":result["exit_code"],"stdout":result["stdout"].as_str().unwrap_or("").chars().take(8000).collect::<String>(),"stderr":result["stderr"].as_str().unwrap_or("").chars().take(8000).collect::<String>(),"excerpt_character_limit":8000,"untrusted_test_output":true}),
        )
    }

    pub async fn recover_and_prune(&self, days: u16) -> Result<()> {
        ensure!((1..=30).contains(&days), "Invalid retention");
        // Only one runtime may own the database (daemon retains an advisory lock).
        // An interrupted write is UNKNOWN, never silently replayed.
        let rows =
            sqlx::query("SELECT id,owner FROM earth_intelligence.sessions WHERE status='running'")
                .fetch_all(&self.pool)
                .await?;
        for row in rows {
            let id: Uuid = row.get("id");
            let owner: String = row.get("owner");
            self.append(&owner,id,Uuid::new_v4(),EventBody::ToolFailed { code:"RUNTIME_RESTARTED".into(), outcome:"Interrupted work has unknown outcome; inspect receipts/files before a new request. No tool was replayed.".into() }).await?;
        }
        sqlx::query(
            "UPDATE earth_intelligence.proposals SET status='unknown' WHERE status='executing'",
        )
        .execute(&self.pool)
        .await?;
        sqlx::query(
            "UPDATE earth_intelligence.requests SET status='interrupted' WHERE status='running'",
        )
        .execute(&self.pool)
        .await?;
        sqlx::query("UPDATE earth_intelligence.sessions SET status='idle' WHERE status='running'")
            .execute(&self.pool)
            .await?;
        self.prune(days).await?;
        Ok(())
    }
    pub async fn prune(&self, days: u16) -> Result<()> {
        ensure!((1..=30).contains(&days), "Invalid retention");
        sqlx::query("DELETE FROM earth_intelligence.shares WHERE expires_at<=now()")
            .execute(&self.pool)
            .await?;
        // A live world instance pins its immutable source artifact and receipt.
        // Revoking authorization cannot destroy the evidence for an uncertain write.
        sqlx::query("DELETE FROM earth_intelligence.sessions s WHERE status<>'running' AND updated_at<now()-make_interval(days=>$1) AND NOT EXISTS (SELECT 1 FROM earth_intelligence.bridge_experiences e JOIN earth_intelligence.bridge_grants g ON g.experience_id=e.id WHERE e.session_id=s.id AND (g.status IN ('executing','committed','unknown') OR (g.status IN ('issued','redeemed') AND g.expires_at>now() AND g.revoked_at IS NULL)))").bind(i32::from(days)).execute(&self.pool).await?;
        Ok(())
    }
}
