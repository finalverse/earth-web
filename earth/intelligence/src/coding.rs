//! Rooted file capabilities. No model-provided executable or shell is accepted.
use crate::protocol::{Patch, digest};
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct Coding {
    root: PathBuf,
    #[cfg(unix)]
    handle: Arc<std::fs::File>,
    node: Option<PathBuf>,
}
pub fn relative(value: &str) -> Result<&Path> {
    ensure!(
        !value.is_empty()
            && value.len() <= 240
            && !value.contains(['\\', '\0', '*', '?', '[', ']', '{', '}', ','])
            && !value.contains("//")
            && !value
                .chars()
                .any(|c| c.is_control()
                    || matches!(c,'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}')),
        "Invalid relative project path"
    );
    let path = Path::new(value);
    ensure!(path.components().count() <= 12, "Path depth budget");
    for component in path.components() {
        let Component::Normal(name) = component else {
            anyhow::bail!("Absolute, dot and parent paths are refused")
        };
        let name = name
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("UTF-8 project paths required"))?;
        let lower = name.to_ascii_lowercase();
        ensure!(
            !name.starts_with(['.', '-'])
                && ![
                    "secret",
                    "credential",
                    "password",
                    "token",
                    "private-key",
                    "id_rsa",
                    "id_ed25519"
                ]
                .iter()
                .any(|s| lower.contains(s)),
            "Private project path refused"
        );
    }
    ensure!(
        matches!(
            path.extension().and_then(|e| e.to_str()),
            Some(
                "js" | "mjs"
                    | "cjs"
                    | "ts"
                    | "tsx"
                    | "json"
                    | "rs"
                    | "py"
                    | "toml"
                    | "md"
                    | "txt"
                    | "html"
                    | "css"
            )
        ),
        "Unsupported text file type"
    );
    Ok(path)
}

impl Coding {
    pub fn new(root: &Path, node: Option<&Path>) -> Result<Self> {
        let root = std::fs::canonicalize(root)?;
        ensure!(root.is_dir(), "Project root must exist");
        let node = node.map(std::fs::canonicalize).transpose()?;
        #[cfg(unix)]
        {
            use rustix::fs::{Mode, OFlags, open};
            let handle = std::fs::File::from(open(
                &root,
                OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )?);
            Ok(Self {
                root,
                handle: Arc::new(handle),
                node,
            })
        }
        #[cfg(not(unix))]
        {
            let _ = (root, node);
            anyhow::bail!(
                "Rooted coding tools require verified Unix file capabilities in this preview"
            )
        }
    }
    #[cfg(unix)]
    fn parent(&self, value: &str) -> Result<(std::os::fd::OwnedFd, String)> {
        use rustix::{
            fs::{Mode, OFlags, openat},
            io::dup,
        };
        let path = relative(value)?;
        let components: Vec<_> = path.components().collect();
        let mut handle = dup(&*self.handle)?;
        for component in &components[..components.len() - 1] {
            handle = openat(
                &handle,
                component.as_os_str(),
                OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )?;
        }
        Ok((handle, path.file_name().unwrap().to_str().unwrap().into()))
    }
    pub fn read(&self, value: &str) -> Result<String> {
        #[cfg(unix)]
        {
            use rustix::fs::{Mode, OFlags, openat};
            use std::io::Read;
            let (parent, name) = self.parent(value)?;
            let mut file = std::fs::File::from(openat(
                &parent,
                &name,
                OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
                Mode::empty(),
            )?);
            ensure!(
                file.metadata()?.is_file() && file.metadata()?.len() <= 65536,
                "Only bounded regular text files may be read"
            );
            let mut text = String::new();
            file.by_ref().take(65537).read_to_string(&mut text)?;
            ensure!(text.len() <= 65536, "File read budget");
            Ok(text)
        }
        #[cfg(not(unix))]
        {
            let _ = value;
            anyhow::bail!("Coding unavailable")
        }
    }
    pub fn validate_patch(&self, patch: &Patch) -> Result<()> {
        ensure!(
            patch.content.len() <= 65536
                && patch.explanation.len() <= 2000
                && patch.expected_sha256.len() == 64,
            "Patch budget or digest invalid"
        );
        ensure!(
            digest(self.read(&patch.path)?.as_bytes()) == patch.expected_sha256,
            "File changed since review; re-propose before approval"
        );
        Ok(())
    }
    pub fn apply(&self, patch: &Patch) -> Result<Value> {
        self.validate_patch(patch)?;
        #[cfg(unix)]
        {
            use rustix::fs::{AtFlags, Mode, OFlags, openat, renameat, unlinkat};
            use std::io::Write;
            let (parent, name) = self.parent(&patch.path)?;
            let previous = std::fs::File::from(openat(
                &parent,
                &name,
                OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )?);
            let temporary = format!(".earth-change-{}", uuid::Uuid::new_v4().simple());
            let operation = (|| -> Result<()> {
                let mut file = std::fs::File::from(openat(
                    &parent,
                    &temporary,
                    OFlags::WRONLY
                        | OFlags::CREATE
                        | OFlags::EXCL
                        | OFlags::NOFOLLOW
                        | OFlags::CLOEXEC,
                    Mode::RUSR | Mode::WUSR,
                )?);
                file.write_all(patch.content.as_bytes())?;
                file.set_permissions(previous.metadata()?.permissions())?;
                file.sync_all()?;
                // Recheck optimistic concurrency immediately before replacement.
                self.validate_patch(patch)?;
                renameat(&parent, &temporary, &parent, &name)?;
                std::fs::File::from(rustix::io::dup(&parent)?).sync_all()?;
                Ok(())
            })();
            if operation.is_err() {
                let _ = unlinkat(&parent, &temporary, AtFlags::empty());
            }
            operation?;
            Ok(
                json!({"kind":"file.patch","path":patch.path,"before_sha256":patch.expected_sha256,"after_sha256":digest(patch.content.as_bytes()),"atomic_replace":true}),
            )
        }
        #[cfg(not(unix))]
        {
            anyhow::bail!("Coding unavailable")
        }
    }
    pub fn search(&self, files: &[String], query: &str) -> Result<Value> {
        ensure!(
            !query.is_empty() && query.len() <= 128 && files.len() <= 16,
            "Search budget"
        );
        let mut matches = Vec::new();
        for path in files {
            let text = self.read(path)?;
            for (line, value) in text
                .lines()
                .enumerate()
                .filter(|(_, line)| line.contains(query))
            {
                matches.push(json!({"path":path,"line":line+1,"text":value.chars().take(240).collect::<String>()}));
                if matches.len() >= 100 {
                    return Ok(json!({"matches":matches,"truncated":true}));
                }
            }
        }
        Ok(json!({"matches":matches,"truncated":false}))
    }

    pub fn validate_test(&self, files: &[String], read_files: &[String]) -> Result<()> {
        ensure!(
            self.node.is_some() && !files.is_empty() && files.len() <= 8 && read_files.len() <= 32,
            "Tests require operator-configured Node and bounded file lists"
        );
        for path in files {
            ensure!(
                path.ends_with(".test.js")
                    || path.ends_with(".test.mjs")
                    || path.ends_with(".test.cjs"),
                "Only explicit Node test files supported"
            );
            self.read(path)?;
        }
        for path in read_files {
            self.read(path)?;
        }
        Ok(())
    }
    pub async fn run_test(
        &self,
        files: &[String],
        read_files: &[String],
        cancel: CancellationToken,
    ) -> Result<Value> {
        use tokio::io::AsyncReadExt;
        self.validate_test(files, read_files)?;
        ensure!(
            std::fs::canonicalize(&self.root)? == self.root,
            "Project root changed"
        );
        let (mut command, network_isolation) =
            crate::sandbox::command(self.node.as_ref().unwrap())?;
        command
            .current_dir(&self.root)
            .env_clear()
            .kill_on_drop(true)
            .args(["--permission", "--max-old-space-size=128"]);
        // No workspace-wide read or write grant, child processes, addons,
        // workers or WASI. Tests can read only the explicitly reviewed files.
        for path in files.iter().chain(read_files) {
            command.arg(format!(
                "--allow-fs-read={}",
                self.root.join(path).display()
            ));
        }
        // Fixed bootstrap avoids Node's directory glob discovery, which would
        // require a broad directory read grant. No model text enters this code.
        const BOOTSTRAP: &str = "import {pathToFileURL} from 'node:url'; for(const file of JSON.parse(process.argv[1])) { await import(pathToFileURL(file).href); }";
        let absolute: Vec<_> = files.iter().map(|path| self.root.join(path)).collect();
        command.args(["--input-type=module", "--eval", BOOTSTRAP]);
        command.arg(serde_json::to_string(&absolute)?);
        command
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        #[cfg(unix)]
        {
            command.process_group(0);
        }
        let mut child = command.spawn()?;
        let pid = child.id();
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let overflow = CancellationToken::new();
        let output_overflow = overflow.clone();
        async fn bounded_output(
            reader: impl tokio::io::AsyncRead + Unpin,
            overflow: CancellationToken,
        ) -> std::io::Result<Vec<u8>> {
            let mut bytes = Vec::new();
            reader.take(65537).read_to_end(&mut bytes).await?;
            if bytes.len() > 65536 {
                overflow.cancel();
                return Err(std::io::Error::other("Output limit exceeded"));
            }
            Ok(bytes)
        }
        let output = tokio::spawn(async move {
            tokio::try_join!(
                bounded_output(stdout, output_overflow.clone()),
                bounded_output(stderr, output_overflow)
            )
        });
        let deadline = tokio::time::timeout(std::time::Duration::from_secs(15), child.wait());
        let status = tokio::select! { biased; _ = cancel.cancelled() => None, _ = overflow.cancelled()=>None, value = deadline => value.ok().and_then(Result::ok) };
        #[cfg(unix)]
        if let Some(pid) = pid
            .filter(|_| status.is_none())
            .and_then(|pid| rustix::process::Pid::from_raw(pid as i32))
        {
            let _ = rustix::process::kill_process_group(pid, rustix::process::Signal::KILL);
        }
        if status.is_none() {
            let _ = child.kill().await;
        }
        let (out, err) =
            tokio::time::timeout(std::time::Duration::from_secs(2), output).await???;
        ensure!(
            out.len() <= 65536 && err.len() <= 65536,
            "Test output exceeded budget"
        );
        ensure!(status.is_some(), "Test cancelled or deadline exceeded");
        Ok(
            json!({"kind":"test.node","exit_code":status.unwrap().code(),"stdout":String::from_utf8_lossy(&out),"stderr":String::from_utf8_lossy(&err),"environment_cleared":true,"filesystem_write_allowed":false,"network_isolation":network_isolation,"full_hostile_code_sandbox":false}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn traversal_private_files_and_absolute_paths_are_denied() {
        for path in [
            "../outside.js",
            "/etc/passwd",
            "a/../../b.js",
            ".env",
            ".git/config",
            "credentials.json",
            "a\\b.js",
            "-x.js",
        ] {
            assert!(relative(path).is_err(), "{path}");
        }
    }
    #[cfg(unix)]
    #[test]
    fn symlink_escapes_and_stale_approvals_cannot_write() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("source.js"), "old").unwrap();
        std::fs::write(outside.path().join("secret.js"), "outside").unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("escape")).unwrap();
        std::os::unix::fs::symlink(
            outside.path().join("secret.js"),
            root.path().join("link.js"),
        )
        .unwrap();
        let coding = Coding::new(root.path(), None).unwrap();
        assert!(coding.read("escape/secret.js").is_err());
        assert!(coding.read("link.js").is_err());
        let patch = Patch {
            path: "source.js".into(),
            expected_sha256: digest(b"old"),
            content: "new".into(),
            explanation: "Fixture".into(),
        };
        coding.apply(&patch).unwrap();
        assert_eq!(coding.read("source.js").unwrap(), "new");
        assert!(coding.apply(&patch).is_err());
        assert_eq!(
            std::fs::read_to_string(outside.path().join("secret.js")).unwrap(),
            "outside"
        );
    }
}
