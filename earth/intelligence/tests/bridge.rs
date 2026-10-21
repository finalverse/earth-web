//! Explicit disposable PostgreSQL integration, never the native world database.
use async_trait::async_trait;
use chrono::Utc;
use earth_intelligence::{
    bridge::*,
    fsip::*,
    model::{Model, ModelRequest, Provider, Router, Usage},
    protocol::NewSession,
    runtime::Runtime,
    spatial::Earth,
    store::Store,
};
use serde_json::{Value, json};
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
struct FixtureProvider(AtomicUsize);
#[async_trait]
impl Provider for FixtureProvider {
    async fn discover(&self) -> anyhow::Result<Vec<Model>> {
        Ok(vec![Model {
            provider: "test-fixture".into(),
            name: "test-layout".into(),
            local: true,
            capabilities: vec!["structured-json".into()],
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
        output.send(r#"{"seating":"conversation","trees":1,"explanation":"Synthetic test layout; not model evidence."}"#.into()).await?;
        Ok(Usage::default())
    }
}
#[tokio::test]
#[ignore = "requires explicit dedicated EARTH_INTELLIGENCE_TEST_DATABASE_URL_FILE"]
async fn handoffs_enforce_owner_audience_expiry_revocation_replay_and_unknown_outcomes()
-> anyhow::Result<()> {
    let file = PathBuf::from(std::env::var("EARTH_INTELLIGENCE_TEST_DATABASE_URL_FILE")?);
    let store = Store::open(&file).await?;
    let owner_key = "a".repeat(64);
    let owner = earth_intelligence::protocol::digest(owner_key.as_bytes());
    let other = "b".repeat(64);
    let session = store
        .create(
            &owner,
            NewSession {
                title: "FSIP authorization integration".into(),
                mode: earth_intelligence::protocol::Mode::Chat,
            },
        )
        .await?;
    let provider = Arc::new(FixtureProvider(AtomicUsize::new(0)));
    let runtime = Runtime::new(
        store.clone(),
        Router {
            providers: vec![provider.clone()],
            preferred: Some("test-layout".into()),
        },
        Earth::new("http://127.0.0.1:1")?,
        None,
    );
    let temp = tempfile::tempdir()?;
    let key = temp.path().join("key");
    std::fs::write(&key, "c".repeat(64))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key, std::fs::Permissions::from_mode(0o600))?;
    }
    let grid = Uuid::new_v4();
    let region = Uuid::new_v4();
    let actor = Uuid::new_v4();
    let config = BridgeConfig {
        socket: temp.path().join("bridge.sock"),
        token_file: key,
        grid_id: grid,
        region_ids: vec![region],
        loopback_tcp: false,
    };
    let bridge = Bridge::new(runtime.clone(), config.clone()).await?;
    let audience = Audience {
        grid_id: grid,
        region_id: region,
    };
    let input = CreateExperience {
        request_id: Uuid::new_v4(),
        request: "Synthetic floating garden".into(),
        layout: Layout::Virtual,
        audience: audience.clone(),
        model: None,
    };
    assert!(
        bridge
            .create(&other, session.id, input.clone())
            .await
            .is_err()
    );
    let created = bridge.create(&owner, session.id, input.clone()).await?;
    let id: Uuid = serde_json::from_value(created["experience_id"].clone())?;
    assert_eq!(
        bridge.create(&owner, session.id, input.clone()).await?["manifest_sha256"],
        created["manifest_sha256"]
    );
    assert_eq!(
        provider.0.load(Ordering::SeqCst),
        1,
        "idempotency must not repeat inference"
    );
    let mut changed = input.clone();
    changed.request = "Changed idempotent input".into();
    assert!(bridge.create(&owner, session.id, changed).await.is_err());
    assert!(bridge.inspect(&other, id).await.is_err());
    let manifest: SpatialExperienceManifest = serde_json::from_value(created["manifest"].clone())?;
    manifest.validate()?;
    assert!(manifest.source_workspace.is_none() && manifest.transform.source_context.is_none());
    let ticket = bridge
        .handoff(&owner, id, HandoffRequest { agent_id: actor })
        .await?;
    let grant: Uuid = serde_json::from_value(ticket["grant_id"].clone())?;
    let token = ticket["token"].as_str().unwrap().to_owned();
    assert!(
        bridge
            .handoff(&other, id, HandoffRequest { agent_id: actor })
            .await
            .is_err()
    );
    assert!(
        bridge
            .redeem(Redeem {
                token: token.clone(),
                agent_id: Uuid::new_v4(),
                audience: audience.clone()
            })
            .await
            .is_err()
    );
    assert!(
        bridge
            .redeem(Redeem {
                token: token.clone(),
                agent_id: actor,
                audience: Audience {
                    grid_id: Uuid::new_v4(),
                    region_id: region
                }
            })
            .await
            .is_err()
    );
    bridge
        .redeem(Redeem {
            token: token.clone(),
            agent_id: actor,
            audience: audience.clone(),
        })
        .await?;
    assert!(
        bridge
            .redeem(Redeem {
                token,
                agent_id: actor,
                audience: audience.clone()
            })
            .await
            .is_err()
    );
    bridge.revoke(&owner, id, grant).await?;
    let auth = || Authorize {
        grant_id: grant,
        agent_id: actor,
        audience: audience.clone(),
        plan_id: Uuid::new_v4(),
        manifest_sha256: created["manifest_sha256"].as_str().unwrap().into(),
    };
    assert!(
        bridge.authorize(auth()).await.is_err(),
        "revoked approvals must fail"
    );
    let fresh = bridge
        .handoff(&owner, id, HandoffRequest { agent_id: actor })
        .await?;
    let next: Uuid = serde_json::from_value(fresh["grant_id"].clone())?;
    bridge
        .redeem(Redeem {
            token: fresh["token"].as_str().unwrap().into(),
            agent_id: actor,
            audience: audience.clone(),
        })
        .await?;
    let mut authorize = auth();
    authorize.grant_id = next;
    bridge.authorize(authorize).await?;
    let mut again = auth();
    again.grant_id = next;
    assert!(bridge.authorize(again).await.is_err());
    let restarted = Bridge::new(runtime, config).await?;
    let mut again = auth();
    again.grant_id = next;
    assert!(
        restarted.authorize(again).await.is_err(),
        "unknown outcomes cannot replay"
    );
    assert!(
        restarted
            .handoff(&owner, id, HandoffRequest { agent_id: actor })
            .await
            .is_err(),
        "unknown mutations fence a duplicate instance"
    );
    let receipt = SpatialReceipt {
        protocol_version: FsipVersion::V01,
        receipt_id: Uuid::new_v4(),
        execution_id: next,
        manifest_sha256: created["manifest_sha256"].as_str().unwrap().into(),
        owner: Owner {
            earth_subject: owner.clone(),
            mutsea_agent_id: Some(actor),
        },
        audience: audience.clone(),
        status: ExecutionStatus::Committed,
        worldline_operation_id: Some(Uuid::new_v4().to_string()),
        bindings: manifest
            .objects
            .iter()
            .map(|o| WorldBinding {
                protocol_version: FsipVersion::V01,
                binding_id: Uuid::new_v4(),
                experience_id: id,
                manifest_sha256: created["manifest_sha256"].as_str().unwrap().into(),
                owner: Owner {
                    earth_subject: owner.clone(),
                    mutsea_agent_id: Some(actor),
                },
                audience: audience.clone(),
                local_id: o.local_id.clone(),
                entity_ids: vec![Uuid::new_v4()],
                source_record_ids: o.source_record_ids.clone(),
            })
            .collect(),
        timestamp: Utc::now(),
    };
    let mut forged = receipt.clone();
    forged.bindings[0].source_record_ids = vec!["fabricated-record".into()];
    assert!(restarted.report(next, forged).await.is_err());
    restarted.report(next, receipt.clone()).await?;
    assert_eq!(
        restarted.report(next, receipt.clone()).await?["duplicate"],
        true
    );
    let mut undo = receipt;
    undo.receipt_id = Uuid::new_v4();
    undo.status = ExecutionStatus::Undone;
    restarted.report(next, undo).await?;
    let expired = restarted
        .handoff(&owner, id, HandoffRequest { agent_id: actor })
        .await?;
    let expires: Uuid = serde_json::from_value(expired["grant_id"].clone())?;
    sqlx::query("UPDATE earth_intelligence.bridge_grants SET expires_at=now()-interval '1 second' WHERE id=$1").bind(expires).execute(&store.pool).await?;
    assert!(
        restarted
            .redeem(Redeem {
                token: expired["token"].as_str().unwrap().into(),
                agent_id: actor,
                audience
            })
            .await
            .is_err()
    );
    let owner_file = temp.path().join("owner-key");
    std::fs::write(&owner_file, &owner_key)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&owner_file, std::fs::Permissions::from_mode(0o600))?;
    }
    verify_http_boundaries(&restarted, owner_file, &owner_key, session.id, id, next).await?;
    sqlx::query("DELETE FROM earth_intelligence.sessions WHERE id=$1 AND owner=$2")
        .bind(session.id)
        .bind(owner)
        .execute(&store.pool)
        .await?;
    Ok(())
}

async fn verify_http_boundaries(
    bridge: &Bridge,
    owner_file: PathBuf,
    owner_key: &str,
    session: Uuid,
    experience: Uuid,
    grant: Uuid,
) -> anyhow::Result<()> {
    use earth_intelligence::{api, bridge_api};
    use reqwest::StatusCode;
    let owner_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let authority = owner_listener.local_addr()?.to_string();
    let mut api = api::Api::new(bridge.runtime.clone(), authority.clone(), &[owner_file])?;
    api.bridge = Some(bridge.clone());
    let owner_server =
        tokio::spawn(async move { axum::serve(owner_listener, api::router(api, None)).await });
    let private_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let private_origin = format!("http://{}", private_listener.local_addr()?);
    let private_router = bridge_api::router(bridge.clone());
    let private_server =
        tokio::spawn(async move { axum::serve(private_listener, private_router).await });
    // Never let developer workstation proxy settings route credentials elsewhere.
    let http = reqwest::Client::builder()
        .no_proxy()
        .timeout(std::time::Duration::from_secs(3))
        .build()?;
    let origin = format!("http://{authority}");
    let events = format!("{origin}/v1/experiences/{experience}/grants/{grant}/events");
    let service_key = "c".repeat(64);
    assert_eq!(
        http.get(&events)
            .bearer_auth(&service_key)
            .send()
            .await?
            .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        http.get(&events)
            .bearer_auth(owner_key)
            .header("Origin", "https://untrusted.invalid")
            .send()
            .await?
            .status(),
        StatusCode::FORBIDDEN
    );
    let redeem = format!("{private_origin}/v1/world/bridge/redeem");
    let invalid = json!({"token":"0".repeat(64),"agent_id":Uuid::new_v4(),"audience":{"grid_id":bridge.config.grid_id,"region_id":bridge.config.region_ids[0]}});
    for (key, host, origin) in [
        (owner_key, "planner", None),
        (&service_key, "wrong-host", None),
        (&service_key, "planner", Some("http://planner")),
    ] {
        let mut request = http
            .post(&redeem)
            .bearer_auth(key)
            .header("Host", host)
            .json(&invalid);
        if let Some(origin) = origin {
            request = request.header("Origin", origin);
        }
        assert_eq!(request.send().await?.status(), StatusCode::UNAUTHORIZED);
    }
    assert_eq!(
        http.post(&redeem)
            .bearer_auth(&service_key)
            .header("Host", "planner")
            .json(&invalid)
            .send()
            .await?
            .status(),
        StatusCode::CONFLICT
    );
    assert_eq!(
        http.get(format!("{private_origin}/v1/sessions"))
            .bearer_auth(&service_key)
            .header("Host", "planner")
            .send()
            .await?
            .status(),
        StatusCode::NOT_FOUND
    );
    let listed: Value = http
        .get(format!("{origin}/v1/sessions/{session}/experiences"))
        .bearer_auth(owner_key)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    assert_eq!(listed["experiences"].as_array().unwrap().len(), 1);
    let replay: Value = http
        .get(&events)
        .bearer_auth(owner_key)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let rows = replay["events"].as_array().unwrap();
    assert_eq!(rows.last().unwrap()["status"], "undone");
    assert!(
        rows.windows(2)
            .all(|pair| pair[1]["sequence"].as_i64().unwrap()
                == pair[0]["sequence"].as_i64().unwrap() + 1)
    );
    let resumed: Value = http
        .get(format!("{events}?after={}", replay["cursor"]))
        .bearer_auth(owner_key)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    assert!(
        resumed["events"].as_array().unwrap().is_empty(),
        "GET replay must not execute another transaction"
    );
    let mut stream = http
        .get(&events)
        .bearer_auth(owner_key)
        .header("Accept", "text/event-stream")
        .send()
        .await?
        .error_for_status()?;
    let frame = stream.chunk().await?.unwrap();
    assert!(std::str::from_utf8(&frame)?.contains("event: fsip.event"));
    drop(stream);
    owner_server.abort();
    private_server.abort();
    Ok(())
}

#[test]
fn wire_schema_has_strict_versioned_shapes() {
    let schema = earth_intelligence::fsip::schema();
    let defs = schema["$defs"].as_object().unwrap();
    for name in [
        "SpatialSession",
        "SpatialContext",
        "SpatialArtifact",
        "SpatialIntent",
        "SpatialPlan",
        "SpatialGrant",
        "SpatialExecution",
        "SpatialReceipt",
        "WorldBinding",
        "SpatialPresence",
        "SpatialExperienceManifest",
    ] {
        assert!(defs.contains_key(name), "{name}");
    }
    assert_eq!(
        defs["SpatialExperienceManifest"]["additionalProperties"],
        false
    );
    let error = json!({"code":"replay","correlation_id":Uuid::new_v4(),"retry_safe":false});
    assert!(serde_json::from_value::<FsipError>(error).is_ok());
    assert!(serde_json::from_value::<AssetRef>(json!({"package_id":"x","version":"1","manifest_sha256":"a".repeat(64),"license":"CC0-1.0","script":"run"})).is_err());
    let _unused: Option<Value> = None;
}
