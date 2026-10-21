//! Private native-world transport. It exposes neither owner sessions nor models.
use crate::{
    bridge::{Authorize, Bridge, Redeem},
    fsip::SpatialReceipt,
    protocol::digest,
};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State},
    http::{Request, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::post,
};
use serde_json::{Value, json};
use subtle::ConstantTimeEq;
use uuid::Uuid;

fn response(result: anyhow::Result<Value>) -> Response {
    match result { Ok(value)=>Json(value).into_response(),Err(_)=>(StatusCode::CONFLICT,Json(json!({"code":"BRIDGE_POLICY_OR_STATE_REFUSED","error":"Inspect the native preview and WorldLine before retrying. No uncertain mutation is replayed."}))).into_response() }
}
async fn guard(
    State(state): State<Bridge>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let h = request.headers();
    let hash = h
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .filter(|v| v.len() == 64 && v.bytes().all(|b| b.is_ascii_hexdigit()))
        .map(|v| digest(v.as_bytes()));
    if h.contains_key(header::ORIGIN)
        || h.get(header::HOST).and_then(|s| s.to_str().ok()) != Some("planner")
        || h.len() > 32
        || !hash.is_some_and(|hash| {
            hash.as_bytes()
                .ct_eq(state.server_hash.as_bytes())
                .unwrap_u8()
                == 1
        })
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"code":"BRIDGE_UNAUTHORIZED"})),
        )
            .into_response();
    }
    let mut result = next.run(request).await;
    result
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    result
}
async fn redeem(State(state): State<Bridge>, Json(input): Json<Redeem>) -> Response {
    response(state.redeem(input).await)
}
async fn authorize(State(state): State<Bridge>, Json(input): Json<Authorize>) -> Response {
    response(state.authorize(input).await)
}
async fn report(
    State(state): State<Bridge>,
    Path(grant): Path<Uuid>,
    Json(input): Json<SpatialReceipt>,
) -> Response {
    response(state.report(grant, input).await)
}
pub fn router(state: Bridge) -> Router {
    Router::new()
        .route("/v1/world/bridge/redeem", post(redeem))
        .route("/v1/world/bridge/authorize", post(authorize))
        .route("/v1/world/bridge/{grant}/receipt", post(report))
        .layer(DefaultBodyLimit::max(65536))
        .layer(middleware::from_fn_with_state(state.clone(), guard))
        .with_state(state)
}

#[cfg(unix)]
pub async fn bind(state: &Bridge) -> anyhow::Result<tokio::net::UnixListener> {
    use anyhow::ensure;
    use std::os::unix::fs::{FileTypeExt, MetadataExt, PermissionsExt};
    let path = &state.config.socket;
    ensure!(
        path.is_absolute()
            && path.as_os_str().len() <= 100
            && !path
                .components()
                .any(|p| matches!(p, std::path::Component::ParentDir)),
        "Invalid private bridge socket path"
    );
    let parent = path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("Private directory required"))?;
    let metadata = std::fs::symlink_metadata(parent)?;
    ensure!(
        metadata.is_dir()
            && !metadata.file_type().is_symlink()
            && metadata.mode() & 0o077 == 0
            && metadata.uid() == unsafe { libc::geteuid() },
        "Bridge socket directory must be private and owned by this runtime"
    );
    if let Ok(existing) = std::fs::symlink_metadata(path) {
        ensure!(
            existing.file_type().is_socket() && existing.uid() == metadata.uid(),
            "Refusing to replace another socket or file"
        );
        let connection = tokio::net::UnixStream::connect(path).await;
        ensure!(
            connection.is_err_and(|e| e.kind() == std::io::ErrorKind::ConnectionRefused),
            "Another bridge may own this socket"
        );
        std::fs::remove_file(path)?;
    }
    let listener = tokio::net::UnixListener::bind(path)?;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    Ok(listener)
}
#[cfg(unix)]
pub async fn serve(listener: tokio::net::UnixListener, state: Bridge) -> anyhow::Result<()> {
    use std::os::unix::fs::MetadataExt;
    let cleanup = state.config.socket.clone();
    let inode = std::fs::symlink_metadata(&cleanup)?.ino();
    let cancel = state.runtime.stopping.clone();
    let result = axum::serve(listener, router(state))
        .with_graceful_shutdown(cancel.cancelled_owned())
        .await;
    if std::fs::symlink_metadata(&cleanup).is_ok_and(|m| m.ino() == inode) {
        let _ = std::fs::remove_file(cleanup);
    }
    result?;
    Ok(())
}
