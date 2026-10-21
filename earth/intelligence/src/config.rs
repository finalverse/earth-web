//! Operator configuration, private files and fail-closed local transport.
use anyhow::{Result, ensure};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub bind: String,
    pub token_files: Vec<PathBuf>,
    pub database_url_file: PathBuf,
    pub earth_origin: String,
    pub ollama_origin: Option<String>,
    pub default_model: Option<String>,
    pub code_root: Option<PathBuf>,
    pub node_binary: Option<PathBuf>,
    pub browser_assets: Option<PathBuf>,
    pub retention_days: u16,
    #[serde(default)]
    pub bridge: Option<crate::bridge::BridgeConfig>,
}

pub fn local_origin(value: &str) -> Result<Url> {
    let url = Url::parse(value)?;
    ensure!(
        url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "[::1]")),
        "Use a literal loopback HTTP origin"
    );
    ensure!(
        url.username().is_empty()
            && url.password().is_none()
            && url.path() == "/"
            && url.query().is_none()
            && url.fragment().is_none(),
        "Origins cannot contain paths, credentials, queries or fragments"
    );
    Ok(url)
}

pub fn private_file(path: &Path) -> Result<String> {
    let metadata = std::fs::symlink_metadata(path)?;
    ensure!(
        metadata.is_file() && !metadata.file_type().is_symlink() && metadata.len() <= 16384,
        "Expected a bounded private regular file"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        ensure!(
            metadata.permissions().mode() & 0o077 == 0,
            "Private files must exclude group and other access"
        );
    }
    Ok(std::fs::read_to_string(path)?.trim().to_owned())
}

pub fn client() -> Result<Client> {
    Ok(Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(90))
        .build()?)
}

pub async fn bounded_json(
    mut response: reqwest::Response,
    cap: usize,
) -> Result<serde_json::Value> {
    response.error_for_status_ref()?;
    ensure!(!response.status().is_redirection(), "Redirects are refused");
    ensure!(
        response.content_length().is_none_or(|n| n <= cap as u64),
        "Response exceeds budget"
    );
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await? {
        ensure!(bytes.len() + chunk.len() <= cap, "Response exceeds budget");
        bytes.extend_from_slice(&chunk);
    }
    Ok(serde_json::from_slice(&bytes)?)
}

impl Config {
    pub fn validate_structure(&self) -> Result<()> {
        let bind: std::net::SocketAddr = self.bind.parse()?;
        ensure!(bind.ip().is_loopback(), "Runtime must bind loopback");
        local_origin(&self.earth_origin)?;
        if let Some(origin) = &self.ollama_origin {
            local_origin(origin)?;
        }
        ensure!(
            !self.token_files.is_empty()
                && self.token_files.len() <= 8
                && (1..=30).contains(&self.retention_days),
            "Invalid owner or retention budget"
        );
        Ok(())
    }
    pub fn load(path: &Path) -> Result<Self> {
        let config: Self = serde_json::from_str(&private_file(path)?)?;
        config.validate_structure()?;
        for path in &config.token_files {
            let token = private_file(path)?;
            ensure!(
                token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit()),
                "Use a 64-character hexadecimal private token"
            );
        }
        if let Some(bridge) = &config.bridge {
            let server_key = private_file(&bridge.token_file)?;
            for owner_file in &config.token_files {
                ensure!(
                    private_file(owner_file)? != server_key,
                    "Native-world and owner credentials must be distinct"
                );
            }
        }
        Ok(config)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_explicit_loopback_origins_are_allowed() {
        assert!(local_origin("http://127.0.0.1:11434").is_ok());
        for origin in [
            "http://localhost:11434",
            "https://api.example.com",
            "http://127.0.0.1/secret",
            "http://user:pass@127.0.0.1",
            "http://127.0.0.1?token=a",
        ] {
            assert!(local_origin(origin).is_err());
        }
    }
}
