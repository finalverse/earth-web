//! Authenticated loopback HTTP, durable replay and explicit spatial-only sharing.
use crate::{config::private_file, protocol::*, runtime::Runtime};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, Request, StatusCode, header},
    middleware::{self, Next},
    response::{
        IntoResponse, Response,
        sse::{Event as SseEvent, KeepAlive, Sse},
    },
    routing::{get, post},
};
use futures_util::stream;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::VecDeque, convert::Infallible, sync::Arc, time::Duration};
use subtle::ConstantTimeEq;
use tokio::sync::Semaphore;
use tracing::Instrument;
use uuid::Uuid;

#[derive(Clone)]
pub struct Api {
    pub runtime: Runtime,
    pub authority: String,
    pub owner_hashes: Arc<Vec<String>>,
    streams: Arc<Semaphore>,
    pub bridge: Option<crate::bridge::Bridge>,
}
impl Api {
    pub fn new(
        runtime: Runtime,
        authority: String,
        files: &[std::path::PathBuf],
    ) -> anyhow::Result<Self> {
        let hashes = files
            .iter()
            .map(|file| Ok(digest(private_file(file)?.as_bytes())))
            .collect::<anyhow::Result<Vec<_>>>()?;
        Ok(Self {
            runtime,
            authority,
            owner_hashes: Arc::new(hashes),
            streams: Arc::new(Semaphore::new(4)),
            bridge: None,
        })
    }
    fn owner(&self, headers: &HeaderMap) -> Result<String, Error> {
        let hash = digest(bearer(headers)?.as_bytes());
        if self
            .owner_hashes
            .iter()
            .any(|value| value.as_bytes().ct_eq(hash.as_bytes()).unwrap_u8() == 1)
        {
            Ok(hash)
        } else {
            Err(Error::unauthorized())
        }
    }
}
fn bearer(headers: &HeaderMap) -> Result<&str, Error> {
    let value = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or_else(Error::unauthorized)?;
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(Error::unauthorized());
    }
    Ok(value)
}
pub struct Error(StatusCode, &'static str, &'static str);
impl Error {
    fn unauthorized() -> Self {
        Self(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "A valid scoped local credential is required.",
        )
    }
    fn refused() -> Self {
        Self(
            StatusCode::CONFLICT,
            "POLICY_OR_STATE_REFUSED",
            "Request refused by schema, policy, quota or current session state; inspect pending proposals before retrying.",
        )
    }
    fn unavailable() -> Self {
        Self(
            StatusCode::NOT_FOUND,
            "UNAVAILABLE",
            "Session or artifact unavailable.",
        )
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.2,"code":self.1}))).into_response()
    }
}

pub fn router(state: Api, assets: Option<std::path::PathBuf>) -> Router {
    let mut router=Router::new()
        .route("/",get(||async{axum::response::Html(include_str!("../web/index.html"))}))
        .route("/app.js",get(||async{([(header::CONTENT_TYPE,"text/javascript; charset=utf-8")],include_str!("../web/app.js"))}))
        .route("/app.css",get(||async{([(header::CONTENT_TYPE,"text/css; charset=utf-8")],include_str!("../web/app.css"))}))
        .route("/healthz",get(||async{Json(json!({"status":"ready","version":VERSION,"protocol_version":PROTOCOL,"public_runtime":false}))}))
        .route("/v1/models",get(models))
        .route("/v1/earth/datasets",get(datasets))
        .route("/v1/earth/places",get(places))
        .route("/v1/sessions",get(sessions).post(create))
        .route("/v1/sessions/{id}",get(session))
        .route("/v1/sessions/{id}/messages",post(message))
        .route("/v1/sessions/{id}/events",get(events))
        .route("/v1/sessions/{id}/pending",get(pending))
        .route("/v1/sessions/{id}/proposals",post(propose))
        .route("/v1/sessions/{id}/approve",post(approve))
        .route("/v1/sessions/{id}/cancel",post(cancel))
        .route("/v1/sessions/{id}/artifacts",get(artifacts))
        .route("/v1/sessions/{id}/artifacts/{artifact}",get(artifact))
        .route("/v1/sessions/{id}/workspace",get(workspace))
        .route("/v1/sessions/{id}/experiences",get(list_experiences).post(create_experience))
        .route("/v1/experiences/{id}",get(inspect_experience))
        .route("/v1/experiences/{id}/handoff",post(experience_handoff))
        .route("/v1/experiences/{id}/grants/{grant}/revoke",post(revoke_experience))
        .route("/v1/experiences/{id}/grants/{grant}/events",get(experience_events))
        .route("/v1/sessions/{id}/share",post(share))
        .route("/v1/sessions/{id}/revoke",post(revoke))
        .route("/v1/sessions/{id}/code/read",post(read_code))
        .route("/v1/sessions/{id}/code/search",post(search_code))
        .route("/v1/browser/workspace",get(shared_workspace))
        .route("/v1/browser/reference",get(shared_reference))
        .route("/v1/browser/events",get(shared_events));
    if let Some(directory) = assets {
        router = router
            .nest_service(
                "/cesium",
                tower_http::services::ServeDir::new(directory.join("cesium")),
            )
            .route(
                "/finalverse-symbol.png",
                get(move || {
                    let path = directory.join("finalverse-symbol.png");
                    async move {
                        match tokio::fs::read(path).await {
                            Ok(bytes) => {
                                ([(header::CONTENT_TYPE, "image/png")], bytes).into_response()
                            }
                            Err(_) => StatusCode::NOT_FOUND.into_response(),
                        }
                    }
                }),
            );
    }
    router
        .layer(DefaultBodyLimit::max(131072))
        .layer(middleware::from_fn_with_state(state.clone(), boundary))
        .with_state(state)
}

async fn create_experience(
    State(state): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<crate::bridge::CreateExperience>,
) -> Result<Json<Value>, Error> {
    let owner = state.owner(&headers)?;
    let bridge = state.bridge.as_ref().ok_or_else(Error::unavailable)?;
    bridge
        .create(&owner, id, input)
        .await
        .map(Json)
        .map_err(|_| Error::refused())
}
async fn list_experiences(
    State(state): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, Error> {
    let owner = state.owner(&headers)?;
    state
        .bridge
        .as_ref()
        .ok_or_else(Error::unavailable)?
        .list(&owner, id)
        .await
        .map(Json)
        .map_err(|_| Error::unavailable())
}
async fn inspect_experience(
    State(state): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, Error> {
    let owner = state.owner(&headers)?;
    let bridge = state.bridge.as_ref().ok_or_else(Error::unavailable)?;
    bridge
        .inspect(&owner, id)
        .await
        .map(Json)
        .map_err(|_| Error::unavailable())
}
async fn experience_handoff(
    State(state): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<crate::bridge::HandoffRequest>,
) -> Result<Json<Value>, Error> {
    let owner = state.owner(&headers)?;
    let bridge = state.bridge.as_ref().ok_or_else(Error::unavailable)?;
    bridge
        .handoff(&owner, id, input)
        .await
        .map(Json)
        .map_err(|_| Error::refused())
}
async fn revoke_experience(
    State(state): State<Api>,
    headers: HeaderMap,
    Path((id, grant)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, Error> {
    let owner = state.owner(&headers)?;
    let bridge = state.bridge.as_ref().ok_or_else(Error::unavailable)?;
    bridge
        .revoke(&owner, id, grant)
        .await
        .map(Json)
        .map_err(|_| Error::refused())
}

async fn boundary(
    State(state): State<Api>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|s| s.to_str().ok());
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|s| s.to_str().ok());
    let expected = format!("http://{}", state.authority);
    if host != Some(state.authority.as_str())
        || origin.is_some_and(|value| value != expected)
        || request.headers().len() > 40
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"code":"ORIGIN_DENIED","error":"Use the configured loopback origin."})),
        )
            .into_response();
    }
    let correlation = request
        .headers()
        .get("X-Request-ID")
        .and_then(|s| s.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .unwrap_or_else(Uuid::new_v4);
    let api_request = request.uri().path().starts_with("/v1/");
    let route = request
        .extensions()
        .get::<axum::extract::MatchedPath>()
        .map_or("unmatched", |path| path.as_str())
        .to_owned();
    let span = tracing::info_span!("http.request", request_id=%correlation, method=%request.method(), route=%route);
    let start = std::time::Instant::now();
    let mut response = next.run(request).instrument(span.clone()).await;
    tracing::info!(parent:&span, event="http.response", status=response.status().as_u16(), elapsed_ms=start.elapsed().as_secs_f64()*1000.0);
    if api_request
        && response.status().is_client_error()
        && !response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("application/json"))
    {
        let status = response.status();
        response=(status,Json(json!({"code":if status==StatusCode::PAYLOAD_TOO_LARGE{"PAYLOAD_TOO_LARGE"}else{"INVALID_REQUEST"},"error":"Request body, route or parameters do not match this protocol."}))).into_response();
    }
    let headers = response.headers_mut();
    headers.insert("X-Request-ID", correlation.to_string().parse().unwrap());
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    headers.insert("X-Content-Type-Options", "nosniff".parse().unwrap());
    headers.insert(
        "Cross-Origin-Resource-Policy",
        "same-origin".parse().unwrap(),
    );
    headers.insert("Content-Security-Policy","default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'".parse().unwrap());
    response
}
async fn datasets(State(s): State<Api>, headers: HeaderMap) -> Result<Json<Value>, Error> {
    s.owner(&headers)?;
    Ok(Json(
        s.runtime
            .earth
            .datasets()
            .await
            .map_err(|_| Error::unavailable())?,
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PlaceSearch {
    #[serde(default)]
    query: String,
}
async fn places(
    State(s): State<Api>,
    headers: HeaderMap,
    Query(input): Query<PlaceSearch>,
) -> Result<Json<Value>, Error> {
    s.owner(&headers)?;
    if input.query.len() > 120 {
        return Err(Error::refused());
    }
    let items = s
        .runtime
        .earth
        .places()
        .await
        .map_err(|_| Error::unavailable())?;
    let needle = input.query.to_lowercase();
    let matches = items
        .as_array()
        .ok_or_else(Error::unavailable)?
        .iter()
        .filter(|item| item.to_string().to_lowercase().contains(&needle))
        .cloned()
        .collect::<Vec<_>>();
    Ok(Json(
        json!({"items":matches,"scope":"Bundled Natural Earth Canadian places","source_grounded":true}),
    ))
}
async fn models(State(s): State<Api>, headers: HeaderMap) -> Result<Json<Value>, Error> {
    s.owner(&headers)?;
    Ok(Json(
        json!({"models":s.runtime.router.models().await,"policy":{"privacy":"local-only","provider_fee":0,"cloud_fallback":false,"post_retries":0}}),
    ))
}
async fn create(
    State(s): State<Api>,
    headers: HeaderMap,
    Json(input): Json<NewSession>,
) -> Result<Json<Session>, Error> {
    let owner = s.owner(&headers)?;
    if input.mode == Mode::Code && s.runtime.coding.is_none() {
        return Err(Error::refused());
    }
    Ok(Json(
        s.runtime
            .store
            .create(&owner, input)
            .await
            .map_err(|_| Error::refused())?,
    ))
}
async fn sessions(State(s): State<Api>, headers: HeaderMap) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    Ok(Json(
        json!({"sessions":s.runtime.store.sessions(&owner).await.map_err(|_|Error::unavailable())?}),
    ))
}
async fn session(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Session>, Error> {
    let owner = s.owner(&headers)?;
    Ok(Json(
        s.runtime
            .store
            .session(&owner, id)
            .await
            .map_err(|_| Error::unavailable())?,
    ))
}
async fn message(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<Message>,
) -> Result<(StatusCode, Json<Value>), Error> {
    let owner = s.owner(&headers)?;
    Ok((
        StatusCode::ACCEPTED,
        Json(
            s.runtime
                .message(owner, id, input)
                .await
                .map_err(|_| Error::refused())?,
        ),
    ))
}
async fn pending(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    Ok(Json(
        json!({"proposals":s.runtime.store.pending(&owner,id).await.map_err(|_|Error::unavailable())?}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Manual {
    request_id: Uuid,
    tool: Tool,
}
async fn propose(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<Manual>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    Ok(Json(
        s.runtime
            .manual(&owner, id, input.request_id, input.tool)
            .await
            .map_err(|_| Error::refused())?,
    ))
}
async fn approve(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<Approval>,
) -> Result<(StatusCode, Json<Value>), Error> {
    let owner = s.owner(&headers)?;
    Ok((
        StatusCode::ACCEPTED,
        Json(
            s.runtime
                .approve(owner, id, input)
                .await
                .map_err(|_| Error::refused())?,
        ),
    ))
}
async fn cancel(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    s.runtime
        .cancel(&owner, id)
        .await
        .map_err(|_| Error::refused())?;
    Ok(Json(json!({"cancellation_requested":true})))
}
async fn artifacts(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    Ok(Json(
        json!({"artifacts":s.runtime.store.artifacts(&owner,id).await.map_err(|_|Error::unavailable())?}),
    ))
}
async fn artifact(
    State(s): State<Api>,
    headers: HeaderMap,
    Path((id, artifact)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    Ok(Json(
        s.runtime
            .store
            .artifact_body(&owner, id, artifact)
            .await
            .map_err(|_| Error::unavailable())?,
    ))
}
async fn workspace(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    Ok(Json(
        s.runtime
            .store
            .latest_workspace(&owner, id)
            .await
            .map_err(|_| Error::unavailable())?
            .1,
    ))
}
async fn share(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    Ok(Json(
        json!({"share_key":s.runtime.store.share(&owner,id).await.map_err(|_|Error::unavailable())?,"expires_in_seconds":3600,"scope":"explicit spatial workspace only"}),
    ))
}
async fn revoke(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    s.runtime
        .store
        .revoke(&owner, id)
        .await
        .map_err(|_| Error::unavailable())?;
    Ok(Json(json!({"revoked":true})))
}
async fn shared_reference(State(s): State<Api>, headers: HeaderMap) -> Result<Json<Value>, Error> {
    s.runtime
        .store
        .shared_workspace(bearer(&headers)?)
        .await
        .map_err(|_| Error::unauthorized())?;
    Ok(Json(
        s.runtime
            .earth
            .reference()
            .await
            .map_err(|_| Error::unavailable())?,
    ))
}
async fn shared_workspace(State(s): State<Api>, headers: HeaderMap) -> Result<Json<Value>, Error> {
    Ok(Json(
        s.runtime
            .store
            .shared_workspace(bearer(&headers)?)
            .await
            .map_err(|_| Error::unauthorized())?,
    ))
}
async fn shared_events(State(s): State<Api>, headers: HeaderMap) -> Result<Json<Value>, Error> {
    Ok(Json(
        json!({"protocol_version":PROTOCOL,"events":s.runtime.store.shared_events(bearer(&headers)?).await.map_err(|_|Error::unauthorized())?}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReadFile {
    path: String,
}
async fn read_code(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<ReadFile>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    if s.runtime
        .store
        .session(&owner, id)
        .await
        .map_err(|_| Error::unavailable())?
        .mode
        != Mode::Code
    {
        return Err(Error::refused());
    }
    let text = s
        .runtime
        .coding
        .as_ref()
        .ok_or_else(Error::refused)?
        .read(&input.path)
        .map_err(|_| Error::refused())?;
    Ok(Json(
        json!({"path":input.path,"text":text,"sha256":digest(text.as_bytes()),"private_code":true}),
    ))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Search {
    files: Vec<String>,
    query: String,
}
async fn search_code(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<Search>,
) -> Result<Json<Value>, Error> {
    let owner = s.owner(&headers)?;
    if s.runtime
        .store
        .session(&owner, id)
        .await
        .map_err(|_| Error::unavailable())?
        .mode
        != Mode::Code
    {
        return Err(Error::refused());
    }
    Ok(Json(
        s.runtime
            .coding
            .as_ref()
            .ok_or_else(Error::refused)?
            .search(&input.files, &input.query)
            .map_err(|_| Error::refused())?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Cursor {
    #[serde(default)]
    after: i64,
}
async fn experience_events(
    State(s): State<Api>,
    headers: HeaderMap,
    Path((id, grant)): Path<(Uuid, Uuid)>,
    Query(cursor): Query<Cursor>,
) -> Result<Response, Error> {
    let owner = s.owner(&headers)?;
    let bridge = s.bridge.as_ref().ok_or_else(Error::unavailable)?;
    let initial = bridge
        .events(&owner, id, grant, cursor.after)
        .await
        .map_err(|_| Error::unavailable())?;
    if !headers
        .get(header::ACCEPT)
        .and_then(|s| s.to_str().ok())
        .is_some_and(|s| s.contains("text/event-stream"))
    {
        let last = initial
            .last()
            .and_then(|e| e["sequence"].as_i64())
            .unwrap_or(cursor.after);
        return Ok(
            Json(json!({"protocol_version":"0.1","events":initial,"cursor":last})).into_response(),
        );
    }
    let permit = s
        .streams
        .clone()
        .try_acquire_owned()
        .map_err(|_| Error::refused())?;
    let state = (
        s,
        owner,
        id,
        grant,
        cursor.after,
        VecDeque::from(initial),
        permit,
    );
    let output = stream::unfold(state, |mut state| async move {
        loop {
            if let Some(event) = state.5.pop_front() {
                state.4 = event["sequence"].as_i64()?;
                let frame = SseEvent::default()
                    .event("fsip.event")
                    .id(state.4.to_string())
                    .json_data(event)
                    .ok()?;
                return Some((Ok::<_, Infallible>(frame), state));
            }
            let next = state
                .0
                .bridge
                .as_ref()?
                .events(&state.1, state.2, state.3, state.4)
                .await
                .ok()?;
            if !next.is_empty() {
                state.5 = VecDeque::from(next);
                continue;
            }
            tokio::select! {_=state.0.runtime.stopping.cancelled()=>return None,_=tokio::time::sleep(Duration::from_secs(1))=>{}}
        }
    });
    Ok(Sse::new(output)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(10)))
        .into_response())
}
async fn events(
    State(s): State<Api>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Query(cursor): Query<Cursor>,
) -> Result<Response, Error> {
    let owner = s.owner(&headers)?;
    let initial = s
        .runtime
        .store
        .events(&owner, id, cursor.after)
        .await
        .map_err(|_| Error::unavailable())?;
    if !headers
        .get(header::ACCEPT)
        .and_then(|s| s.to_str().ok())
        .is_some_and(|s| s.contains("text/event-stream"))
    {
        return Ok(Json(json!({"protocol_version":PROTOCOL,"events":initial,"cursor":initial.last().map_or(cursor.after,|e|e.sequence)})).into_response());
    }
    let permit = s.streams.clone().try_acquire_owned().map_err(|_| {
        Error(
            StatusCode::TOO_MANY_REQUESTS,
            "STREAM_LIMIT",
            "Close an existing event stream before opening another.",
        )
    })?;
    let state = (s, owner, id, cursor.after, VecDeque::from(initial), permit);
    let output = stream::unfold(state, |mut state| async move {
        loop {
            if let Some(event) = state.4.pop_front() {
                state.3 = event.sequence;
                let frame = SseEvent::default()
                    .event("earth.event")
                    .id(event.sequence.to_string())
                    .json_data(event)
                    .ok()?;
                return Some((Ok::<_, Infallible>(frame), state));
            }
            let next = state
                .0
                .runtime
                .store
                .events(&state.1, state.2, state.3)
                .await
                .ok()?;
            if !next.is_empty() {
                state.4 = VecDeque::from(next);
                continue;
            }
            tokio::select! {_=state.0.runtime.stopping.cancelled()=>return None,_=state.0.runtime.changed.notified()=>{},_=tokio::time::sleep(Duration::from_secs(1))=>{}}
        }
    });
    Ok(Sse::new(output)
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(10)))
        .into_response())
}
