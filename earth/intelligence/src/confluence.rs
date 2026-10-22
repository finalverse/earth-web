// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
//! Scoped continuity over the existing session store. No model or world executor lives here.
use crate::{bridge::Bridge, fsip::Audience, protocol::*, store::Store};
use anyhow::{Result, ensure};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Invite {
    pub agent_id: Uuid,
    pub audience: Audience,
    pub can_propose: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Join {
    pub token: String,
    pub agent_id: Uuid,
    pub audience: Audience,
    pub native_session_id: Uuid,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Access {
    pub grant_id: Uuid,
    pub agent_id: Uuid,
    pub audience: Audience,
    pub native_session_id: Uuid,
    #[serde(default)]
    pub after: i64,
    #[serde(default)]
    pub artifact_id: Option<Uuid>,
    #[serde(default)]
    pub message: Option<Message>,
}
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactKind {
    Conversation,
    Research,
    GeographicWorkspace,
    DataVisualization,
    SceneProposal,
    AssetPreview,
    WorldExecutionReceipt,
}
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtifactProvenance {
    pub source: Option<String>,
    pub license: Option<String>,
    pub quality: Option<String>,
    pub execution_id: Option<String>,
    pub coordinate_context: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ArtifactReference {
    pub protocol_version: crate::fsip::FsipVersion,
    pub artifact_id: Uuid,
    pub session_id: Uuid,
    pub owner: crate::fsip::Owner,
    pub kind: ArtifactKind,
    pub title: String,
    pub version: u32,
    pub source: String,
    pub permissions: Vec<String>,
    pub spatial_context: Option<crate::fsip::SpatialContext>,
    pub provenance: ArtifactProvenance,
    pub content_sha256: String,
    pub lifecycle: String,
    pub created_at: DateTime<Utc>,
}
fn opaque_token(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}
impl Store {
    async fn confluence_slot(&self) -> Result<tokio::sync::OwnedSemaphorePermit> {
        // A grant transaction holds one connection while canonical store methods
        // read through the same five-connection pool. Reserve capacity for both.
        Ok(tokio::time::timeout(
            std::time::Duration::from_secs(1),
            self.confluence_slots.clone().acquire_owned(),
        )
        .await??)
    }
    pub async fn confluence_invite(&self, owner: &str, id: Uuid, input: Invite) -> Result<Value> {
        ensure!(
            !input.agent_id.is_nil()
                && !input.audience.grid_id.is_nil()
                && !input.audience.region_id.is_nil(),
            "Explicit participant and audience required"
        );
        let mut tx = self.pool.begin().await?;
        let mode: String = sqlx::query_scalar(
            "SELECT mode FROM earth_intelligence.sessions WHERE id=$1 AND owner=$2 FOR UPDATE",
        )
        .bind(id)
        .bind(owner)
        .fetch_one(&mut *tx)
        .await?;
        ensure!(
            mode != "code",
            "Local code sessions cannot be shared with spatial clients"
        );
        let count:i64=sqlx::query_scalar("SELECT count(*) FROM earth_intelligence.confluence_grants WHERE session_id=$1 AND expires_at>now() AND revoked_at IS NULL")
            .bind(id).fetch_one(&mut *tx).await?;
        ensure!(count < 64, "Participant quota");
        let grant = Uuid::new_v4();
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let expires:DateTime<Utc>=sqlx::query_scalar("INSERT INTO earth_intelligence.confluence_grants(id,session_id,token_sha256,actor_id,grid_id,region_id,can_propose,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '1 hour') RETURNING expires_at")
            .bind(grant).bind(id).bind(digest(token.as_bytes())).bind(input.agent_id).bind(input.audience.grid_id).bind(input.audience.region_id).bind(input.can_propose).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(
            json!({"grant_id":grant,"session_id":id,"token":token,"agent_id":input.agent_id,"audience":input.audience,"can_read":true,"can_propose":input.can_propose,"can_approve":false,"can_edit_world":false,"expires_at":expires,"scope":"Explicit non-code session content and spatial artifacts; no local files or world authority"}),
        )
    }
    pub async fn confluence_revoke(&self, owner: &str, id: Uuid, grant: Uuid) -> Result<Value> {
        self.session(owner, id).await?;
        let changed=sqlx::query("UPDATE earth_intelligence.confluence_grants g SET revoked_at=COALESCE(revoked_at,now()) FROM earth_intelligence.sessions s WHERE g.id=$1 AND g.session_id=$2 AND s.id=g.session_id AND s.owner=$3")
            .bind(grant).bind(id).bind(owner).execute(&self.pool).await?.rows_affected();
        ensure!(changed == 1, "Grant unavailable");
        Ok(
            json!({"revoked":true,"grant_id":grant,"previously_authorized_work":"not replayed or undone by revocation"}),
        )
    }
    async fn confluence_access(
        &self,
        access: &Access,
        write: bool,
    ) -> Result<(Transaction<'_, Postgres>, String, Uuid)> {
        ensure!(
            access.after >= 0 && access.after <= 4096 && !access.native_session_id.is_nil(),
            "Invalid cursor or native session"
        );
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("SELECT s.owner,s.id,g.can_propose FROM earth_intelligence.confluence_grants g JOIN earth_intelligence.sessions s ON s.id=g.session_id WHERE g.id=$1 AND g.actor_id=$2 AND g.grid_id=$3 AND g.region_id=$4 AND g.native_session_id=$5 AND g.revoked_at IS NULL AND g.expires_at>now() AND s.mode<>'code' FOR UPDATE OF g")
            .bind(access.grant_id).bind(access.agent_id).bind(access.audience.grid_id).bind(access.audience.region_id).bind(access.native_session_id).fetch_one(&mut *tx).await?;
        ensure!(
            !write || row.get::<bool, _>("can_propose"),
            "Read-only participant"
        );
        Ok((tx, row.get("owner"), row.get("id")))
    }
    pub async fn confluence_join(&self, input: Join) -> Result<Value> {
        ensure!(
            opaque_token(&input.token) && !input.native_session_id.is_nil(),
            "Invalid handoff"
        );
        let row=sqlx::query("UPDATE earth_intelligence.confluence_grants g SET native_session_id=$1,last_seen_at=now() FROM earth_intelligence.sessions s WHERE g.token_sha256=$2 AND g.actor_id=$3 AND g.grid_id=$4 AND g.region_id=$5 AND g.native_session_id IS NULL AND g.revoked_at IS NULL AND g.expires_at>now() AND s.id=g.session_id AND s.mode<>'code' RETURNING g.id,g.session_id,g.can_propose,g.expires_at")
            .bind(input.native_session_id).bind(digest(input.token.as_bytes())).bind(input.agent_id).bind(input.audience.grid_id).bind(input.audience.region_id).fetch_one(&self.pool).await?;
        Ok(
            json!({"grant_id":row.get::<Uuid,_>("id"),"session_id":row.get::<Uuid,_>("session_id"),"can_propose":row.get::<bool,_>("can_propose"),"can_approve":false,"can_edit_world":false,"expires_at":row.get::<DateTime<Utc>,_>("expires_at")}),
        )
    }
    async fn confluence_snapshot(
        &self,
        owner: &str,
        id: Uuid,
        after: i64,
        can_propose: bool,
    ) -> Result<Value> {
        let session = self.session(owner, id).await?;
        ensure!(session.mode != Mode::Code, "Code sessions are private");
        let mut events = Vec::new();
        let mut bytes = 0;
        for event in self.events(owner, id, after).await? {
            let n = serde_json::to_vec(&event)?.len();
            if bytes + n > 24000 || events.len() >= 32 {
                break;
            }
            bytes += n;
            events.push(event);
        }
        let cursor = events.last().map_or(after, |e| e.sequence);
        let artifacts = self.confluence_references(owner, id).await?;
        let participants=sqlx::query("SELECT actor_id,bool_or(can_propose) AS can_propose,max(last_seen_at) AS last_seen_at FROM earth_intelligence.confluence_grants WHERE session_id=$1 AND revoked_at IS NULL AND expires_at>now() GROUP BY actor_id ORDER BY actor_id LIMIT 64")
            .bind(id).fetch_all(&self.pool).await?;
        Ok(
            json!({"protocol_version":PROTOCOL,"session":session,"cursor":cursor,"events":events,"artifacts":artifacts,"participants":participants.into_iter().map(|p|json!({"agent_id":p.get::<Uuid,_>("actor_id"),"can_propose":p.get::<bool,_>("can_propose"),"last_seen_at":p.get::<Option<DateTime<Utc>>,_>("last_seen_at"),"presence_grants_editing":false})).collect::<Vec<_>>(),"permissions":{"can_read":true,"can_propose":can_propose,"can_approve":false,"can_edit_world":false}}),
        )
    }
    pub async fn confluence_native_snapshot(&self, access: &Access) -> Result<Value> {
        let _slot = self.confluence_slot().await?;
        ensure!(
            access.message.is_none() && access.artifact_id.is_none(),
            "Use the typed message or artifact operation"
        );
        let (mut tx, owner, id) = self.confluence_access(access, false).await?;
        let can:bool=sqlx::query_scalar("UPDATE earth_intelligence.confluence_grants SET last_seen_at=now() WHERE id=$1 RETURNING can_propose")
            .bind(access.grant_id).fetch_one(&mut *tx).await?;
        let value = self
            .confluence_snapshot(&owner, id, access.after, can)
            .await?;
        ensure!(
            serde_json::to_vec(&value)?.len() <= 60000,
            "Shared response quota"
        );
        tx.commit().await?;
        Ok(value)
    }
    pub async fn confluence_browser_snapshot(&self, token: &str, after: i64) -> Result<Value> {
        let _slot = self.confluence_slot().await?;
        ensure!(opaque_token(token), "Invalid scoped credential");
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("SELECT s.owner,s.id FROM earth_intelligence.confluence_grants g JOIN earth_intelligence.sessions s ON s.id=g.session_id WHERE g.token_sha256=$1 AND g.revoked_at IS NULL AND g.expires_at>now() AND s.mode<>'code' FOR UPDATE OF g")
            .bind(digest(token.as_bytes())).fetch_one(&mut *tx).await?;
        // Browser continuity is read-only even when the native participant may propose.
        let value = self
            .confluence_snapshot(&row.get::<String, _>("owner"), row.get("id"), after, false)
            .await?;
        ensure!(
            serde_json::to_vec(&value)?.len() <= 60000,
            "Shared response quota"
        );
        tx.commit().await?;
        Ok(value)
    }
    pub async fn confluence_browser_artifact(&self, token: &str, artifact: Uuid) -> Result<Value> {
        let _slot = self.confluence_slot().await?;
        ensure!(opaque_token(token), "Invalid scoped credential");
        let mut tx = self.pool.begin().await?;
        let row=sqlx::query("SELECT s.owner,s.id FROM earth_intelligence.confluence_grants g JOIN earth_intelligence.sessions s ON s.id=g.session_id WHERE g.token_sha256=$1 AND g.revoked_at IS NULL AND g.expires_at>now() AND s.mode<>'code' FOR UPDATE OF g")
            .bind(digest(token.as_bytes())).fetch_one(&mut *tx).await?;
        let owner: String = row.get("owner");
        let id: Uuid = row.get("id");
        ensure!(
            self.confluence_references(&owner, id)
                .await?
                .iter()
                .any(|r| r.artifact_id == artifact),
            "Artifact unavailable"
        );
        let value = self.artifact_body(&owner, id, artifact).await?;
        ensure!(
            serde_json::to_vec(&value)?.len() <= 1_900_000,
            "Shared response quota"
        );
        tx.commit().await?;
        Ok(value)
    }
    pub async fn confluence_references(
        &self,
        owner: &str,
        id: Uuid,
    ) -> Result<Vec<ArtifactReference>> {
        let session = self.session(owner, id).await?;
        ensure!(session.mode != Mode::Code, "Code artifacts are private");
        let rows=sqlx::query("SELECT a.id,a.kind,a.body,a.created_at FROM earth_intelligence.artifacts a JOIN earth_intelligence.sessions s ON s.id=a.session_id WHERE a.session_id=$1 AND s.owner=$2 AND a.kind='spatial_workspace' ORDER BY a.created_at DESC LIMIT 8")
            .bind(id).bind(owner).fetch_all(&self.pool).await?;
        rows.into_iter().map(|row|{
            let artifact:Uuid=row.get("id");let body:Value=row.get("body");
            Ok(ArtifactReference{protocol_version:crate::fsip::FsipVersion::V01,artifact_id:artifact,session_id:id,
                owner:crate::fsip::Owner{earth_subject:owner.into(),mutsea_agent_id:None},kind:ArtifactKind::GeographicWorkspace,title:body["title"].as_str().unwrap_or("Geographic workspace").chars().take(120).collect(),version:1,
                source:format!("fsip://sessions/{id}/artifacts/{artifact}"),permissions:vec!["read".into()],spatial_context:None,
                provenance:ArtifactProvenance{source:body["provenance"]["source"].as_str().map(|s|s.chars().take(1024).collect()),license:body["provenance"]["license"].as_str().map(|s|s.chars().take(256).collect()),quality:body["provenance"]["quality"].as_str().map(|s|s.chars().take(512).collect()),execution_id:body["receipt"]["execution_id"].as_str().map(|s|s.chars().take(128).collect()),coordinate_context:"Inspect the original source snapshot; no native georeferencing is implied".into()},
                content_sha256:digest(&serde_json::to_vec(&body)?),lifecycle:"immutable_snapshot".into(),created_at:row.get("created_at")})
        }).collect()
    }
    pub async fn confluence_native_artifact(&self, access: &Access) -> Result<Value> {
        let _slot = self.confluence_slot().await?;
        ensure!(
            access.message.is_none(),
            "Message is not an artifact request"
        );
        let (tx, owner, id) = self.confluence_access(access, false).await?;
        let artifact = access
            .artifact_id
            .ok_or_else(|| anyhow::anyhow!("Artifact required"))?;
        ensure!(
            self.confluence_references(&owner, id)
                .await?
                .iter()
                .any(|a| a.artifact_id == artifact),
            "Artifact not shared"
        );
        let body = self.artifact_body(&owner, id, artifact).await?;
        // Full data stays in Earth, opened through the scoped Web/CLI surface.
        let value = json!({"artifact_id":artifact,"session_id":id,"title":body["title"],"plan":body["plan"],"receipt":body["receipt"],"provenance":body["provenance"],"facilities":body["application_state"]["result"]["data"]["features"].as_array().map(|v|v.iter().take(6).cloned().collect::<Vec<_>>()),"source_backed":true,"world_geometry":"schematic exhibition; not a reconstruction"});
        ensure!(
            serde_json::to_vec(&value)?.len() < 48000,
            "Artifact preview quota"
        );
        ensure!(
            serde_json::to_vec(&value)?.len() <= 60000,
            "Shared response quota"
        );
        tx.commit().await?;
        Ok(value)
    }
}
impl Bridge {
    pub async fn confluence_message(&self, access: Access) -> Result<Value> {
        let _slot = self.runtime.store.confluence_slot().await?;
        let (tx, owner, id) = self.runtime.store.confluence_access(&access, true).await?;
        let message = access
            .message
            .ok_or_else(|| anyhow::anyhow!("Message required"))?;
        ensure!(
            message.file.is_none() && message.artifact.is_none() && message.model.is_none(),
            "Shared messages cannot select a provider, file or private artifact"
        );
        let source = if let Some(artifact) = access.artifact_id {
            ensure!(
                self.runtime
                    .store
                    .confluence_references(&owner, id)
                    .await?
                    .iter()
                    .any(|r| r.artifact_id == artifact),
                "Artifact is not shared with this session"
            );
            Some((
                artifact,
                self.runtime
                    .store
                    .artifact_body(&owner, id, artifact)
                    .await?,
            ))
        } else {
            self.runtime.store.latest_workspace(&owner, id).await.ok()
        };
        let context = if let Some((artifact, body)) = source {
            json!({"participant":access.agent_id,"artifact_id":artifact,"content_sha256":digest(&serde_json::to_vec(&body)?),"untrusted_source_data":true,"receipt":body["receipt"],"provenance":body["provenance"],"facilities":body["application_state"]["result"]["data"]["features"].as_array().map(|v|v.iter().take(6).cloned().collect::<Vec<_>>()),"data_limit":"First six source records; archival evidence only, never a complete or current world survey"})
        } else {
            json!({"participant":access.agent_id,"source_context":null})
        };
        ensure!(
            serde_json::to_vec(&context)?.len() <= 24000,
            "Shared model context budget"
        );
        let request = message.request_id;
        let result = self
            .runtime
            .message_context(owner.clone(), id, message, Some(context))
            .await?;
        // The request remains in the canonical runtime, not a viewer transcript.
        if result["replayed"] != true {
            self.runtime
                .store
                .append(
                    &owner,
                    id,
                    request,
                    EventBody::ParticipantMessage {
                        agent_id: access.agent_id,
                    },
                )
                .await?;
        }
        tx.commit().await?;
        Ok(result)
    }
}
