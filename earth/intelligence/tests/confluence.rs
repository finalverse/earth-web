// Copyright 2026 Finalverse contributors. SPDX-License-Identifier: MIT
//! Real isolated PostgreSQL authorization, replay and continuity tests; no world DB writes.
use async_trait::async_trait;
use earth_intelligence::{
    bridge::{Bridge, BridgeConfig},
    confluence::*,
    fsip::Audience,
    model::{Model, ModelRequest, Provider, Router, Usage},
    protocol::*,
    runtime::Runtime,
    spatial::Earth,
    store::Store,
};
use serde_json::json;
use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
struct ModelFixture(AtomicUsize);
#[async_trait]
impl Provider for ModelFixture {
    async fn discover(&self) -> anyhow::Result<Vec<Model>> {
        Ok(vec![Model {
            provider: "test-fixture".into(),
            name: "confluence-fixture".into(),
            local: true,
            capabilities: vec!["stream".into()],
            provider_fee: 0,
        }])
    }
    async fn generate(
        &self,
        _: ModelRequest,
        _: CancellationToken,
        output: mpsc::Sender<String>,
    ) -> anyhow::Result<Usage> {
        self.0.fetch_add(1, Ordering::SeqCst);
        for text in ["Synthetic ", "streaming answer."] {
            output.send(text.into()).await?;
        }
        Ok(Usage::default())
    }
}
fn message(request: Uuid) -> Message {
    Message {
        request_id: request,
        text: "Fixture conversation, not geographic evidence".into(),
        model: None,
        file: None,
        artifact: None,
    }
}
#[tokio::test]
#[ignore = "requires explicit disposable earth_intelligence_test PostgreSQL"]
async fn shared_session_continuity_permissions_revocation_and_restart() -> anyhow::Result<()> {
    let file = PathBuf::from(std::env::var("EARTH_INTELLIGENCE_TEST_DATABASE_URL_FILE")?);
    let dsn = earth_intelligence::config::private_file(&file)?;
    assert_eq!(
        reqwest::Url::parse(&dsn)?.path(),
        "/earth_intelligence_test"
    );
    let store = Store::open(&file).await?;
    let owner = Uuid::new_v4().to_string();
    let stranger = Uuid::new_v4().to_string();
    let session = store
        .create(
            &owner,
            NewSession {
                title: "Synthetic Confluence acceptance".into(),
                mode: Mode::Chat,
            },
        )
        .await?;
    let code = store
        .create(
            &owner,
            NewSession {
                title: "Private coding context".into(),
                mode: Mode::Code,
            },
        )
        .await?;
    let grid = Uuid::new_v4();
    let region = Uuid::new_v4();
    let actor_a = Uuid::new_v4();
    let actor_b = Uuid::new_v4();
    let audience = Audience {
        grid_id: grid,
        region_id: region,
    };
    let invite = |actor, can| Invite {
        agent_id: actor,
        audience: audience.clone(),
        can_propose: can,
    };
    assert!(
        store
            .confluence_invite(&stranger, session.id, invite(actor_a, true))
            .await
            .is_err()
    );
    assert!(
        store
            .confluence_invite(&owner, code.id, invite(actor_a, true))
            .await
            .is_err()
    );
    let a = store
        .confluence_invite(&owner, session.id, invite(actor_a, true))
        .await?;
    let b = store
        .confluence_invite(&owner, session.id, invite(actor_b, false))
        .await?;
    let grant_a: Uuid = serde_json::from_value(a["grant_id"].clone())?;
    let grant_b: Uuid = serde_json::from_value(b["grant_id"].clone())?;
    let token_a = a["token"].as_str().unwrap().to_owned();
    let token_b = b["token"].as_str().unwrap().to_owned();
    assert!(
        store
            .confluence_browser_snapshot(&"f".repeat(64), 0)
            .await
            .is_err()
    );
    let world_a = Uuid::new_v4();
    let world_b = Uuid::new_v4();
    assert!(
        store
            .confluence_join(Join {
                token: token_a.clone(),
                agent_id: actor_b,
                audience: audience.clone(),
                native_session_id: world_a
            })
            .await
            .is_err()
    );
    for (token, actor, native) in [
        (token_a.clone(), actor_a, world_a),
        (token_b.clone(), actor_b, world_b),
    ] {
        store
            .confluence_join(Join {
                token,
                agent_id: actor,
                audience: audience.clone(),
                native_session_id: native,
            })
            .await?;
    }
    assert!(
        store
            .confluence_join(Join {
                token: token_a.clone(),
                agent_id: actor_a,
                audience: audience.clone(),
                native_session_id: world_a
            })
            .await
            .is_err()
    );
    let access = |grant, actor, native| Access {
        grant_id: grant,
        agent_id: actor,
        audience: audience.clone(),
        native_session_id: native,
        after: 0,
        artifact_id: None,
        message: None,
    };
    let a_access = access(grant_a, actor_a, world_a);
    let b_access = access(grant_b, actor_b, world_b);
    assert!(
        store
            .confluence_native_snapshot(&access(grant_a, actor_b, world_b))
            .await
            .is_err()
    );
    assert!(
        store
            .confluence_native_snapshot(&access(grant_a, actor_a, Uuid::new_v4()))
            .await
            .is_err()
    );
    let fixture = Arc::new(ModelFixture(AtomicUsize::new(0)));
    let runtime = Runtime::new(
        store.clone(),
        Router {
            providers: vec![fixture.clone()],
            preferred: Some("confluence-fixture".into()),
        },
        Earth::new("http://127.0.0.1:1")?,
        None,
    );
    let private = tempfile::tempdir()?;
    let key = private.path().join("bridge-token");
    earth_intelligence::cli::write_private(&key, "c".repeat(64).as_bytes())?;
    let bridge = Bridge::new(
        runtime.clone(),
        BridgeConfig {
            socket: private.path().join("bridge.sock"),
            token_file: key,
            grid_id: grid,
            region_ids: vec![region],
            loopback_tcp: false,
        },
    )
    .await?;
    let request = Uuid::new_v4();
    let mut write = a_access.clone();
    write.message = Some(message(request));
    let mut denied = b_access.clone();
    denied.message = Some(message(Uuid::new_v4()));
    assert!(bridge.confluence_message(denied).await.is_err());
    let mut file_access = write.clone();
    file_access.message.as_mut().unwrap().file = Some("private.env".into());
    assert!(bridge.confluence_message(file_access).await.is_err());
    bridge.confluence_message(write.clone()).await?;
    for _ in 0..100 {
        if store.session(&owner, session.id).await?.status == "idle" {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    assert_eq!(bridge.confluence_message(write).await?["replayed"], true);
    assert_eq!(fixture.0.load(Ordering::SeqCst), 1);
    let web = store.confluence_browser_snapshot(&token_b, 0).await?;
    assert_eq!(web["session"]["id"], session.id.to_string());
    assert_eq!(web["permissions"]["can_propose"], false);
    assert!(
        web["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["type"] == "message.delta")
    );
    assert_eq!(
        web["events"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|e| e["type"] == "confluence.participant_message")
            .count(),
        1
    );
    let snapshot = store.confluence_native_snapshot(&b_access).await?;
    assert_eq!(snapshot["session"]["id"], web["session"]["id"]);
    assert!(
        snapshot["participants"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p["presence_grants_editing"] == false)
    );
    let workspace = json!({"title":"Synthetic fixture only","plan":{"schema_version":1},"receipt":{"execution_id":"fixture-receipt"},"provenance":{"source":"https://example.test/fixture","license":"Synthetic fixture","quality":"Not observed data"},"application_state":{"result":{"data":{"features":[]}}}});
    let artifact = store
        .artifact(&owner, session.id, "spatial_workspace", workspace.clone())
        .await?;
    let private_artifact = store
        .artifact(
            &owner,
            code.id,
            "test_receipt",
            json!({"stdout":"PRIVATE_LOCAL_FILE_MARKER"}),
        )
        .await?;
    let references = store.confluence_references(&owner, session.id).await?;
    assert_eq!(references.len(), 1);
    assert_eq!(
        references[0].content_sha256,
        digest(&serde_json::to_vec(&workspace)?)
    );
    let mut inspect = b_access.clone();
    inspect.artifact_id = Some(artifact);
    assert_eq!(
        store.confluence_native_artifact(&inspect).await?["receipt"],
        workspace["receipt"]
    );
    inspect.artifact_id = Some(private_artifact);
    assert!(store.confluence_native_artifact(&inspect).await.is_err());
    let reopened = Store::open(&file).await?;
    let replay = reopened.confluence_native_snapshot(&b_access).await?;
    assert_eq!(replay["session"]["id"], session.id.to_string());
    assert_eq!(replay["artifacts"][0]["artifact_id"], artifact.to_string());
    assert!(!replay.to_string().contains("PRIVATE_LOCAL_FILE_MARKER"));
    assert!(
        store
            .confluence_revoke(&stranger, session.id, grant_b)
            .await
            .is_err()
    );
    let mut grounded = a_access.clone();
    grounded.artifact_id = Some(artifact);
    grounded.message = Some(message(Uuid::new_v4()));
    bridge.confluence_message(grounded).await?;
    for _ in 0..100 {
        if store.session(&owner, session.id).await?.status == "idle" {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    }
    let mut foreign = a_access.clone();
    foreign.artifact_id = Some(private_artifact);
    foreign.message = Some(message(Uuid::new_v4()));
    assert!(bridge.confluence_message(foreign).await.is_err());
    {
        use axum::{
            body::Body,
            http::{Request, StatusCode},
        };
        use tower::ServiceExt;
        let router = earth_intelligence::bridge_api::router(bridge.clone());
        for (key, origin, status) in [
            (token_a.as_str(), false, StatusCode::UNAUTHORIZED),
            (
                "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                true,
                StatusCode::UNAUTHORIZED,
            ),
            (
                "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                false,
                StatusCode::OK,
            ),
        ] {
            let mut request = Request::builder()
                .method("POST")
                .uri("/v1/world/confluence/read")
                .header("Host", "planner")
                .header("Authorization", format!("Bearer {key}"))
                .header("Content-Type", "application/json");
            if origin {
                request = request.header("Origin", "https://untrusted.example");
            }
            let response = router
                .clone()
                .oneshot(request.body(Body::from(serde_json::to_vec(&a_access)?))?)
                .await?;
            assert_eq!(response.status(), status);
        }
    }
    store.confluence_revoke(&owner, session.id, grant_b).await?;
    assert!(store.confluence_native_snapshot(&b_access).await.is_err());
    assert!(
        store
            .confluence_browser_snapshot(&token_b, 0)
            .await
            .is_err()
    );
    assert!(store.confluence_native_snapshot(&a_access).await.is_ok());
    let mut readers = Vec::new();
    for _ in 0..8 {
        let s = store.clone();
        let key = token_a.clone();
        readers.push(tokio::spawn(async move {
            s.confluence_browser_snapshot(&key, 0).await
        }));
    }
    for task in readers {
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(3), task)
                .await??
                .is_ok(),
            "Concurrent shared views must not exhaust their own connection pool"
        );
    }
    sqlx::query("UPDATE earth_intelligence.confluence_grants SET expires_at=created_at+interval '1 microsecond' WHERE id=$1").bind(grant_a).execute(&store.pool).await?;
    assert!(store.confluence_native_snapshot(&a_access).await.is_err());
    runtime.shutdown();
    Ok(())
}
