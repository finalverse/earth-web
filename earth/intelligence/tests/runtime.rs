//! Requires a disposable, separately named database; never uses the dev/live DB.
use anyhow::Result;
use async_trait::async_trait;
use axum::{
    Json, Router as HttpRouter,
    routing::{get, post},
};
use earth_intelligence::{
    api::{Api, router},
    coding::Coding,
    config::{Config, client, private_file},
    model::{Model, ModelRequest, Provider, Router as ModelRouter, Usage},
    protocol::*,
    runtime::Runtime,
    spatial::Earth,
    store::{Claim, Store},
};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

struct Mock;
#[async_trait]
impl Provider for Mock {
    async fn discover(&self) -> Result<Vec<Model>> {
        Ok(vec![Model {
            provider: "deterministic-ci-fixture".into(),
            name: "fixture".into(),
            local: true,
            capabilities: vec!["stream".into()],
            provider_fee: 0,
        }])
    }
    async fn generate(
        &self,
        input: ModelRequest,
        cancel: CancellationToken,
        output: tokio::sync::mpsc::Sender<String>,
    ) -> Result<Usage> {
        if input.prompt.contains("CANCEL_ME") {
            cancel.cancelled().await;
            anyhow::bail!("Cancelled");
        }
        if input.prompt.contains("CHECK_PERSISTED_HISTORY") {
            let prompt: Value = serde_json::from_str(&input.prompt)?;
            assert!(
                prompt["conversation"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|m| m["text"] == "Stream this answer")
            );
        }
        for part in ["A streamed ", "fixture answer."] {
            tokio::select! {_=cancel.cancelled()=>anyhow::bail!("Cancelled"),_=tokio::time::sleep(Duration::from_millis(10))=>{}}
            output.send(part.into()).await?;
        }
        Ok(Usage {
            input_tokens: 5,
            output_tokens: 3,
            elapsed_ms: 20,
        })
    }
}
async fn wait(runtime: &Runtime, owner: &str, id: Uuid, request: Uuid) -> Vec<Event> {
    for _ in 0..150 {
        let events = runtime.store.events(owner, id, 0).await.unwrap();
        if events.iter().any(|event| {
            event.request_id == request
                && matches!(
                    event.body,
                    EventBody::SessionCompleted { .. }
                        | EventBody::SessionCancelled { .. }
                        | EventBody::ToolFailed { .. }
                )
        }) {
            return events;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("Owned fixture request did not reach a terminal event");
}
fn private(path: &Path, content: &[u8]) {
    earth_intelligence::cli::write_private(path, content).unwrap();
}
async fn call(
    http: &reqwest::Client,
    origin: &str,
    token: &str,
    path: &str,
    body: Option<Value>,
) -> (u16, Value) {
    let request = match body {
        Some(body) => http.post(format!("{origin}{path}")).json(&body),
        None => http.get(format!("{origin}{path}")),
    };
    let response = request.bearer_auth(token).send().await.unwrap();
    let status = response.status().as_u16();
    (status, response.json().await.unwrap())
}

#[tokio::test]
#[ignore = "requires explicitly configured disposable PostgreSQL and Node 24"]
async fn durable_owned_sessions_streaming_approvals_cli_coding_and_explicit_browser_shares() {
    let database = PathBuf::from(
        std::env::var_os("EARTH_INTELLIGENCE_TEST_DATABASE_URL_FILE")
            .expect("Set a disposable test database URL FILE"),
    );
    let url = reqwest::Url::parse(&private_file(&database).unwrap()).unwrap();
    assert_eq!(
        url.path(),
        "/earth_intelligence_test",
        "Refusing to mutate any other database"
    );
    let node = PathBuf::from(
        std::env::var_os("EARTH_INTELLIGENCE_NODE_BINARY")
            .expect("Set an explicit Node 24 executable"),
    );
    let store = Store::open(&database).await.unwrap();
    let project = tempfile::tempdir().unwrap();
    std::fs::write(
        project.path().join("add.mjs"),
        "export function add(a,b){return a-b;}\n",
    )
    .unwrap();
    std::fs::write(project.path().join("add.test.mjs"),"import test from 'node:test';import assert from 'node:assert/strict';import {add} from './add.mjs';test('adds',()=>assert.equal(add(2,3),5));\n").unwrap();
    let tokens = tempfile::tempdir().unwrap();
    let token_a = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let token_b = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    let owner_a = digest(token_a.as_bytes());
    let owner_b = digest(token_b.as_bytes());
    let token_file_a = tokens.path().join("a");
    let token_file_b = tokens.path().join("b");
    private(&token_file_a, token_a.as_bytes());
    private(&token_file_b, token_b.as_bytes());
    let node_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let earth_origin = format!("http://{}", node_listener.local_addr().unwrap());
    let fixture=HttpRouter::new().route("/readyz",get(||async{Json(json!({"status":"ready"}))}))
        .route("/v1/apps/finalverse.intelligence/query/validate",post(|Json(plan):Json<Value>|async move{Json(json!({"plan":plan,"requires_review":true}))}))
        .route("/v1/apps/finalverse.intelligence/query",post(|Json(plan):Json<Value>|async move{
            Json(json!({"schema_version":1,"plan":plan,"summary":"Synthetic integration fixture, not observed facilities","elapsed_ms":0.1,"data":{"type":"FeatureCollection","features":[{"type":"Feature","id":"fixture-1","geometry":{"type":"Point","coordinates":[-73.58,45.50]},"properties":{"name":"Synthetic fixture","fuel":"Hydro","capacity_mw":1}}],"total":1,"truncated":false,"measurements":[{"feature_id":"fixture-1","distance_m":0}],"analysis":{"center":[-73.58,45.50],"radius_m":100000}},"receipt":{"execution_id":Uuid::new_v4(),"plan_sha256":digest(&serde_json::to_vec(&plan).unwrap()),"executed_at":chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true),"core_version":"test-fixture","access":"read-only"},"provenance":{"dataset_id":"wri-canada-power-plants","dataset_version":"synthetic-fixture","quality":"Synthetic fixture only","source":"https://example.test/fixture"}}))
        }));
    let node_server = tokio::spawn(async move {
        axum::serve(node_listener, fixture).await.unwrap();
    });
    std::fs::write(project.path().join("security.test.mjs"),format!(r#"import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import net from 'node:net';import {{spawnSync}} from 'node:child_process';
    test('outside filesystem denied',()=>assert.throws(()=>fs.readFileSync('/etc/passwd'),{{code:'ERR_ACCESS_DENIED'}}));
    test('filesystem writes denied',()=>assert.throws(()=>fs.writeFileSync(new URL('./denied.txt',import.meta.url),'x'),{{code:'ERR_ACCESS_DENIED'}}));
    test('child process denied',()=>assert.throws(()=>spawnSync('/usr/bin/true'),{{code:'ERR_ACCESS_DENIED'}}));
    test('OS network boundary',async()=>{{await assert.rejects(new Promise((resolve,reject)=>{{const socket=net.createConnection({{host:'127.0.0.1',port:{}}});socket.once('connect',()=>{{socket.destroy();reject(new Error('Unexpected network access'));}});socket.once('error',reject);}}),error=>['EPERM','EACCES','ERR_ACCESS_DENIED'].includes(error.code));}});
    test('environment is private',()=>assert.equal(process.env.AWS_SECRET_ACCESS_KEY,undefined));
    "#,reqwest::Url::parse(&earth_origin).unwrap().port().unwrap())).unwrap();
    let runtime = Runtime::new(
        store.clone(),
        ModelRouter {
            providers: vec![Arc::new(Mock)],
            preferred: Some("fixture".into()),
        },
        Earth::new(&earth_origin).unwrap(),
        Some(Coding::new(project.path(), Some(&node)).unwrap()),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap().to_string();
    let state = Api::new(
        runtime.clone(),
        address.clone(),
        &[token_file_a.clone(), token_file_b],
    )
    .unwrap();
    let app = router(state, None);
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let origin = format!("http://{address}");
    let http = client().unwrap();
    assert_eq!(
        http.get(format!("{origin}/v1/sessions"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    assert_eq!(
        http.get(format!("{origin}/v1/sessions"))
            .header("Origin", "https://evil.invalid")
            .bearer_auth(&token_a)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        http.get(format!("{origin}/v1/sessions"))
            .header("Host", "evil.invalid")
            .bearer_auth(&token_a)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );

    let chat = store
        .create(
            &owner_a,
            NewSession {
                title: "Fixture conversation".into(),
                mode: Mode::Chat,
            },
        )
        .await
        .unwrap();
    assert!(store.session(&owner_b, chat.id).await.is_err());
    let request = Message {
        artifact: None,
        request_id: Uuid::new_v4(),
        text: "A general question".into(),
        model: None,
        file: None,
    };
    let (first, second) = tokio::join!(
        store.claim(&owner_a, chat.id, &request),
        store.claim(&owner_a, chat.id, &request)
    );
    assert!(matches!(
        (&first, &second),
        (Ok(Claim::Started), Ok(Claim::Existing(_))) | (Ok(Claim::Existing(_)), Ok(Claim::Started))
    ));
    let mut changed = request.clone();
    changed.text = "different input".into();
    assert!(store.claim(&owner_a, chat.id, &changed).await.is_err());
    store
        .finish(&owner_a, chat.id, request.request_id, "completed")
        .await
        .unwrap();
    let message = Message {
        artifact: None,
        request_id: Uuid::new_v4(),
        text: "Stream this answer".into(),
        model: None,
        file: None,
    };
    runtime
        .message(owner_a.clone(), chat.id, message.clone())
        .await
        .unwrap();
    let events = wait(&runtime, &owner_a, chat.id, message.request_id).await;
    assert!(
        events
            .iter()
            .filter(|event| matches!(event.body, EventBody::MessageDelta { .. }))
            .count()
            >= 2
    );
    for (index, event) in events.iter().enumerate() {
        assert_eq!(event.sequence, index as i64 + 1);
    }
    let reopened = Store::open(&database).await.unwrap();
    assert_eq!(
        reopened.events(&owner_a, chat.id, 0).await.unwrap().len(),
        events.len()
    );
    assert!(store.events(&owner_a, chat.id, -1).await.is_err());
    assert!(store.events(&owner_a, chat.id, 99999).await.is_err());
    assert_eq!(
        call(
            &http,
            &origin,
            &token_b,
            &format!("/v1/sessions/{}", chat.id),
            None
        )
        .await
        .0,
        404
    );

    let code = store
        .create(
            &owner_a,
            NewSession {
                title: "Private coding".into(),
                mode: Mode::Code,
            },
        )
        .await
        .unwrap();
    let before = std::fs::read(project.path().join("add.mjs")).unwrap();
    let patch = Tool::Patch(Patch {
        path: "add.mjs".into(),
        expected_sha256: digest(&before),
        content: "export function add(a,b){return a+b;}\n".into(),
        explanation: "Correct subtraction to addition".into(),
    });
    let proposal: Proposal = serde_json::from_value(
        runtime
            .manual(&owner_a, code.id, Uuid::new_v4(), patch)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        std::fs::read(project.path().join("add.mjs")).unwrap(),
        before,
        "A proposal must not write"
    );
    assert!(
        runtime
            .approve(
                owner_a.clone(),
                code.id,
                Approval {
                    proposal_id: proposal.id,
                    sha256: "0".repeat(64)
                }
            )
            .await
            .is_err()
    );
    runtime
        .approve(
            owner_a.clone(),
            code.id,
            Approval {
                proposal_id: proposal.id,
                sha256: proposal.sha256.clone(),
            },
        )
        .await
        .unwrap();
    let events = wait(&runtime, &owner_a, code.id, proposal.request_id).await;
    assert!(
        events
            .iter()
            .any(|event| matches!(event.body, EventBody::ToolCompleted { .. }))
    );
    assert!(
        std::fs::read_to_string(project.path().join("add.mjs"))
            .unwrap()
            .contains("a+b")
    );
    assert!(
        runtime
            .approve(
                owner_a.clone(),
                code.id,
                Approval {
                    proposal_id: proposal.id,
                    sha256: proposal.sha256
                }
            )
            .await
            .is_err()
    );
    assert_eq!(
        call(
            &http,
            &origin,
            &token_a,
            &format!("/v1/sessions/{}/code/read", code.id),
            Some(json!({"path":"../outside.mjs"}))
        )
        .await
        .0,
        409
    );
    assert_eq!(call(&http,&origin,&token_a,&format!("/v1/sessions/{}/proposals",code.id),Some(json!({"request_id":Uuid::new_v4(),"tool":{"kind":"shell","arguments":{"command":"whoami"}}}))).await.0,422);
    assert!(store.share(&owner_a, code.id).await.is_err());
    let proposal: Proposal = serde_json::from_value(
        runtime
            .manual(
                &owner_a,
                code.id,
                Uuid::new_v4(),
                Tool::NodeTest {
                    files: vec!["add.test.mjs".into(), "security.test.mjs".into()],
                    read_files: vec!["add.mjs".into()],
                },
            )
            .await
            .unwrap(),
    )
    .unwrap();
    runtime
        .approve(
            owner_a.clone(),
            code.id,
            Approval {
                proposal_id: proposal.id,
                sha256: proposal.sha256,
            },
        )
        .await
        .unwrap();
    let events = wait(&runtime, &owner_a, code.id, proposal.request_id).await;
    let artifact = events
        .iter()
        .find_map(|event| {
            if event.request_id == proposal.request_id {
                if let EventBody::ToolCompleted { artifact_id, .. } = event.body {
                    Some(artifact_id)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .expect("Approved test did not complete");
    let result = store
        .artifact_body(&owner_a, code.id, artifact)
        .await
        .unwrap();
    assert_eq!(
        result["result"]["exit_code"], 0,
        "Restricted test runner failed: {result}"
    );
    assert_eq!(result["result"]["environment_cleared"], true);

    let explanation = Message {
        request_id: Uuid::new_v4(),
        text: "Explain the recorded test outcome".into(),
        model: None,
        file: None,
        artifact: Some(artifact),
    };
    runtime
        .message(owner_a.clone(), code.id, explanation.clone())
        .await
        .unwrap();
    assert!(
        wait(&runtime, &owner_a, code.id, explanation.request_id)
            .await
            .iter()
            .any(|e| e.request_id == explanation.request_id
                && matches!(e.body, EventBody::MessageDelta { .. }))
    );
    assert!(
        store
            .test_context(&owner_b, code.id, artifact)
            .await
            .is_err()
    );
    let spatial = store
        .create(
            &owner_a,
            NewSession {
                title: "Explicit spatial view".into(),
                mode: Mode::Spatial,
            },
        )
        .await
        .unwrap();
    let query = Tool::EarthQuery(earth_intelligence::protocol::Query::WithinDistance(
        DistanceArgs {
            dataset: "wri-canada-power-plants".into(),
            place_id: "ne-place-1173".into(),
            radius_m: 100000,
            fuels: vec!["Hydro".into()],
            limit: 100,
        },
    ));
    let proposal: Proposal = serde_json::from_value(
        runtime
            .manual(&owner_a, spatial.id, Uuid::new_v4(), query)
            .await
            .unwrap(),
    )
    .unwrap();
    runtime
        .approve(
            owner_a.clone(),
            spatial.id,
            Approval {
                proposal_id: proposal.id,
                sha256: proposal.sha256,
            },
        )
        .await
        .unwrap();
    let events = wait(&runtime, &owner_a, spatial.id, proposal.request_id).await;
    assert!(
        events
            .iter()
            .any(|event| matches!(event.body, EventBody::WorkspaceUpdated { .. }))
    );
    let share = store.share(&owner_a, spatial.id).await.unwrap();
    assert_eq!(
        call(&http, &origin, &share, "/v1/sessions", None).await.0,
        401,
        "Spatial share cannot read private sessions"
    );
    let (status, workspace) = call(&http, &origin, &share, "/v1/browser/workspace", None).await;
    assert_eq!(status, 200);
    assert_eq!(workspace["application"], "finalverse.energy-explorer");
    let (_, events) = call(&http, &origin, &share, "/v1/browser/events", None).await;
    assert!(
        events["events"]
            .as_array()
            .unwrap()
            .iter()
            .all(|event| event["type"] == "workspace.updated")
    );
    store.revoke(&owner_a, spatial.id).await.unwrap();
    assert_eq!(
        call(&http, &origin, &share, "/v1/browser/workspace", None)
            .await
            .0,
        401
    );

    let resumed = Message {
        artifact: None,
        request_id: Uuid::new_v4(),
        text: "CHECK_PERSISTED_HISTORY".into(),
        model: None,
        file: None,
    };
    runtime
        .message(owner_a.clone(), chat.id, resumed.clone())
        .await
        .unwrap();
    let history = wait(&runtime, &owner_a, chat.id, resumed.request_id).await;
    assert!(history.iter().any(|e| e.request_id == resumed.request_id
        && matches!(e.body, EventBody::SessionCompleted { .. })));
    let count = history.len();
    assert_eq!(
        runtime
            .message(owner_a.clone(), chat.id, resumed)
            .await
            .unwrap()["replayed"],
        true
    );
    assert_eq!(
        store.events(&owner_a, chat.id, 0).await.unwrap().len(),
        count,
        "Idempotent request cannot execute again"
    );
    let cancelled = Message {
        artifact: None,
        request_id: Uuid::new_v4(),
        text: "CANCEL_ME".into(),
        model: None,
        file: None,
    };
    runtime
        .message(owner_a.clone(), chat.id, cancelled.clone())
        .await
        .unwrap();
    runtime.cancel(&owner_a, chat.id).await.unwrap();
    assert!(
        wait(&runtime, &owner_a, chat.id, cancelled.request_id)
            .await
            .iter()
            .any(|e| matches!(e.body, EventBody::SessionCancelled { .. }))
    );
    let patch = Tool::Patch(Patch {
        path: "add.mjs".into(),
        expected_sha256: digest(&std::fs::read(project.path().join("add.mjs")).unwrap()),
        content: "DO NOT APPLY".into(),
        explanation: "Recovery and cancellation sentinel".into(),
    });
    let pending: Proposal = serde_json::from_value(
        runtime
            .manual(&owner_a, code.id, Uuid::new_v4(), patch.clone())
            .await
            .unwrap(),
    )
    .unwrap();
    runtime.cancel(&owner_a, code.id).await.unwrap();
    assert!(
        runtime
            .approve(
                owner_a.clone(),
                code.id,
                Approval {
                    proposal_id: pending.id,
                    sha256: pending.sha256
                }
            )
            .await
            .is_err()
    );
    let interrupted: Proposal = serde_json::from_value(
        runtime
            .manual(&owner_a, code.id, Uuid::new_v4(), patch)
            .await
            .unwrap(),
    )
    .unwrap();
    store
        .approve(
            &owner_a,
            code.id,
            &Approval {
                proposal_id: interrupted.id,
                sha256: interrupted.sha256,
            },
        )
        .await
        .unwrap();
    // Simulate death after consuming approval but before recording an outcome.
    store.recover_and_prune(7).await.unwrap();
    let outcome: String =
        sqlx::query_scalar("SELECT status FROM earth_intelligence.proposals WHERE id=$1")
            .bind(interrupted.id)
            .fetch_one(&store.pool)
            .await
            .unwrap();
    assert_eq!(outcome, "unknown");
    assert!(
        !std::fs::read_to_string(project.path().join("add.mjs"))
            .unwrap()
            .contains("DO NOT APPLY")
    );
    let recovery = store.events(&owner_a, code.id, 0).await.unwrap();
    assert!(
        recovery
            .iter()
            .any(|e| matches!(&e.body,EventBody::ToolFailed{code,..} if code=="RUNTIME_RESTARTED"))
    );
    let expired = store
        .create(
            &owner_b,
            NewSession {
                title: "Retention fixture".into(),
                mode: Mode::Chat,
            },
        )
        .await
        .unwrap();
    sqlx::query(
        "UPDATE earth_intelligence.sessions SET updated_at=now()-interval '8 days' WHERE id=$1",
    )
    .bind(expired.id)
    .execute(&store.pool)
    .await
    .unwrap();
    store.prune(7).await.unwrap();
    assert!(store.session(&owner_b, expired.id).await.is_err());

    let full = store
        .create(
            &owner_b,
            NewSession {
                title: "Quota boundary fixture".into(),
                mode: Mode::Chat,
            },
        )
        .await
        .unwrap();
    // Set metadata at the boundary without thousands of network round trips.
    sqlx::query("UPDATE earth_intelligence.sessions SET cursor=4032 WHERE id=$1")
        .bind(full.id)
        .execute(&store.pool)
        .await
        .unwrap();
    let budget_request = Message {
        request_id: Uuid::new_v4(),
        text: "Quota fixture".into(),
        model: None,
        file: None,
        artifact: None,
    };
    assert!(
        store
            .claim(&owner_b, full.id, &budget_request)
            .await
            .is_err()
    );
    assert!(
        store
            .append(
                &owner_b,
                full.id,
                budget_request.request_id,
                EventBody::MessageDelta {
                    text: "over quota".into()
                }
            )
            .await
            .is_err()
    );
    assert!(
        store
            .append(
                &owner_b,
                full.id,
                budget_request.request_id,
                EventBody::ToolFailed {
                    code: "BUDGET_REACHED".into(),
                    outcome: "Reserved terminal audit slot".into()
                }
            )
            .await
            .is_ok()
    );

    let config = Config {
        bind: address,
        token_files: vec![token_file_a],
        database_url_file: database,
        earth_origin,
        ollama_origin: None,
        default_model: Some("fixture".into()),
        code_root: None,
        node_binary: None,
        browser_assets: None,
        retention_days: 7,
    };
    let configuration = tokens.path().join("config.json");
    private(&configuration, &serde_json::to_vec(&config).unwrap());
    let cli = tokio::process::Command::new(env!("CARGO_BIN_EXE_earth"))
        .arg("--config")
        .arg(configuration)
        .args(["ask", "CLI fixture streaming", "--json"])
        .output()
        .await
        .unwrap();
    assert!(
        cli.status.success(),
        "CLI failed: {}",
        String::from_utf8_lossy(&cli.stderr)
    );
    let lines: Vec<Value> = String::from_utf8(cli.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert!(lines.iter().any(|event| event["type"] == "message.delta"));
    assert!(
        lines
            .iter()
            .any(|event| event["type"] == "session.completed")
    );
    runtime.shutdown();
    server.abort();
    node_server.abort();
    // All rows belong to this disposable test's generated identities.
    sqlx::query("DELETE FROM earth_intelligence.sessions WHERE owner=$1 OR owner=$2")
        .bind(&owner_a)
        .bind(&owner_b)
        .execute(&store.pool)
        .await
        .unwrap();
}
