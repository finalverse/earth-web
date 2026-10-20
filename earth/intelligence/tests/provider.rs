use axum::{
    Json, Router,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use earth_intelligence::model::{ModelRequest, Ollama, Provider};
use serde_json::json;
use std::{
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};
use tokio_util::sync::CancellationToken;

async fn serve(router: Router) -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    (
        origin,
        tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        }),
    )
}
#[tokio::test]
async fn actual_ndjson_chunks_are_streamed_and_cloud_descriptors_are_excluded() {
    let body = concat!(
        "{\"message\":{\"content\":\"Hel\"}}\n",
        "{\"message\":{\"content\":\"lo\"}}\n",
        "{\"message\":{\"content\":\"\"},\"done\":true,\"prompt_eval_count\":7,\"eval_count\":2}\n"
    );
    let (origin,server)=serve(Router::new().route("/api/show",post(||async{Json(json!({"capabilities":["completion"]}))})).route("/api/chat",post(move||async move{body})).route("/api/tags",get(||async{Json(json!({"models":[{"name":"local"},{"name":"qwen:cloud"},{"name":"remote-alias","remote_host":"https://remote.invalid"}]}))}))).await;
    let provider = Arc::new(Ollama::new(&origin).unwrap());
    let models = provider.discover().await.unwrap();
    assert_eq!(models.len(), 1);
    assert_eq!(models[0].name, "local");
    let (send, mut receive) = tokio::sync::mpsc::channel(1);
    let pending = provider.clone();
    let task = tokio::spawn(async move {
        pending
            .generate(
                ModelRequest {
                    model: "local".into(),
                    system: "test".into(),
                    prompt: "test".into(),
                    schema: None,
                },
                CancellationToken::new(),
                send,
            )
            .await
    });
    assert_eq!(receive.recv().await.unwrap(), "Hel");
    assert_eq!(receive.recv().await.unwrap(), "lo");
    let usage = task.await.unwrap().unwrap();
    assert_eq!(usage.input_tokens, 7);
    assert_eq!(usage.output_tokens, 2);
    server.abort();
}
#[tokio::test]
async fn redirects_never_forward_inference_to_a_different_origin() {
    let count = Arc::new(AtomicUsize::new(0));
    let target_count = count.clone();
    let (target, target_server) = serve(Router::new().fallback(move || {
        let count = target_count.clone();
        async move {
            count.fetch_add(1, Ordering::SeqCst);
            "{}"
        }
    }))
    .await;
    let (origin, server) = serve(Router::new().fallback(move || {
        let target = target.clone();
        async move { (StatusCode::TEMPORARY_REDIRECT, [("Location", target)]).into_response() }
    }))
    .await;
    let provider = Ollama::new(&origin).unwrap();
    assert!(provider.discover().await.is_err());
    let (send, _) = tokio::sync::mpsc::channel(1);
    assert!(
        provider
            .generate(
                ModelRequest {
                    model: "local".into(),
                    system: "private".into(),
                    prompt: "private".into(),
                    schema: None
                },
                CancellationToken::new(),
                send
            )
            .await
            .is_err()
    );
    assert_eq!(count.load(Ordering::SeqCst), 0);
    server.abort();
    target_server.abort();
}
#[tokio::test]
async fn cancellation_interrupts_a_live_stream_and_incomplete_done_is_rejected() {
    let (origin, server) = serve(
        Router::new()
            .route(
                "/api/show",
                post(|| async { Json(json!({"capabilities":["completion"]})) }),
            )
            .route(
                "/api/chat",
                post(|| async {
                    let body = futures_util::stream::unfold(0, |state| async move {
                        if state > 0 {
                            tokio::time::sleep(Duration::from_secs(30)).await;
                        }
                        Some((
                            Ok::<_, std::io::Error>("{\"message\":{\"content\":\"part\"}}\n"),
                            state + 1,
                        ))
                    });
                    axum::body::Body::from_stream(body)
                }),
            ),
    )
    .await;
    let provider = Arc::new(Ollama::new(&origin).unwrap());
    let cancel = CancellationToken::new();
    let token = cancel.clone();
    let (send, mut receive) = tokio::sync::mpsc::channel(1);
    let task = tokio::spawn(async move {
        provider
            .generate(
                ModelRequest {
                    model: "local".into(),
                    system: "test".into(),
                    prompt: "test".into(),
                    schema: None,
                },
                token,
                send,
            )
            .await
    });
    assert_eq!(receive.recv().await.unwrap(), "part");
    cancel.cancel();
    assert!(
        tokio::time::timeout(Duration::from_millis(500), task)
            .await
            .unwrap()
            .unwrap()
            .is_err()
    );
    server.abort();
    let (origin, server) = serve(
        Router::new()
            .route(
                "/api/show",
                post(|| async { Json(json!({"capabilities":["completion"]})) }),
            )
            .route(
                "/api/chat",
                post(|| async { "{\"message\":{\"content\":\"unfinished\"}}\n" }),
            ),
    )
    .await;
    let provider = Ollama::new(&origin).unwrap();
    let (send, _receive) = tokio::sync::mpsc::channel(1);
    assert!(
        provider
            .generate(
                ModelRequest {
                    model: "local".into(),
                    system: "test".into(),
                    prompt: "test".into(),
                    schema: None
                },
                CancellationToken::new(),
                send
            )
            .await
            .is_err()
    );
    server.abort();
}

#[tokio::test]
async fn remote_metadata_cannot_receive_private_prompts_even_under_a_local_alias() {
    let calls = Arc::new(AtomicUsize::new(0));
    let count = calls.clone();
    let (origin,server)=serve(Router::new().route("/api/show",post(||async{Json(json!({"capabilities":["completion"],"remote_host":"https://cloud.invalid"}))})).route("/api/chat",post(move||{let count=count.clone();async move{count.fetch_add(1,Ordering::SeqCst);"forbidden"}}))).await;
    let provider = Ollama::new(&origin).unwrap();
    let (send, _receive) = tokio::sync::mpsc::channel(1);
    assert!(
        provider
            .generate(
                ModelRequest {
                    model: "local-alias".into(),
                    system: "test".into(),
                    prompt: "Private fixture source".into(),
                    schema: None
                },
                CancellationToken::new(),
                send
            )
            .await
            .is_err()
    );
    assert_eq!(calls.load(Ordering::SeqCst), 0);
    server.abort();
}
