//! Native client. POSTs are never automatically retried; replay uses GET events.
use crate::{
    config::{Config, bounded_json, client, local_origin, private_file},
    protocol::*,
};
use anyhow::{Result, ensure};
use clap::{Parser, Subcommand, ValueEnum};
use futures_util::StreamExt;
use serde_json::{Value, json};
use std::{
    io::Write,
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Parser)]
#[command(
    name = "earth",
    version,
    about = "Earth Intelligence — local AI, spatial evidence and approved tools"
)]
pub struct Args {
    #[arg(long, global = true)]
    config: Option<PathBuf>,
    #[arg(long, global = true)]
    json: bool,
    #[arg(long, global = true)]
    session: Option<Uuid>,
    #[arg(long, global = true, default_value = "chat")]
    mode: CliMode,
    #[arg(long, global = true)]
    model: Option<String>,
    #[arg(long, global = true)]
    file: Option<String>,
    #[arg(long, global = true)]
    artifact: Option<Uuid>,
    #[command(subcommand)]
    command: Option<Command>,
}
#[derive(Clone, Copy, ValueEnum)]
enum CliMode {
    Chat,
    Spatial,
    Code,
}
impl From<CliMode> for Mode {
    fn from(mode: CliMode) -> Self {
        match mode {
            CliMode::Chat => Self::Chat,
            CliMode::Spatial => Self::Spatial,
            CliMode::Code => Self::Code,
        }
    }
}
#[derive(Subcommand)]
enum Command {
    /// Propose a pinned experience; native preview and approval are separate.
    Experience {
        #[command(subcommand)]
        action: ExperienceAction,
    },
    Ask {
        question: String,
    },
    Models,
    Datasets,
    Places {
        query: String,
    },
    Sessions {
        #[command(subcommand)]
        action: Option<SessionAction>,
    },
    Workspace {
        #[command(subcommand)]
        action: Option<WorkspaceAction>,
    },
    Config {
        #[command(subcommand)]
        action: Option<ConfigAction>,
    },
    Doctor,
}
#[derive(Subcommand)]
enum ExperienceAction {
    List,
    Plan {
        request: String,
        #[arg(long)]
        grid: Uuid,
        #[arg(long)]
        region: Uuid,
        #[arg(long)]
        virtual_only: bool,
        #[arg(long)]
        request_id: Option<Uuid>,
        #[arg(long)]
        output: PathBuf,
    },
    Inspect {
        id: Uuid,
    },
    Handoff {
        id: Uuid,
        #[arg(long)]
        agent: Uuid,
        #[arg(long)]
        output: PathBuf,
    },
    Revoke {
        id: Uuid,
        grant: Uuid,
    },
}
#[derive(Subcommand)]
enum SessionAction {
    Show,
    Pending,
    Cancel,
    Approve {
        proposal: Uuid,
        #[arg(long)]
        sha256: String,
    },
    Export {
        #[arg(long)]
        output: PathBuf,
    },
    Artifact {
        id: Uuid,
    },
}
#[derive(Subcommand)]
enum WorkspaceAction {
    Export {
        #[arg(long)]
        output: PathBuf,
    },
    Share {
        #[arg(long)]
        output: PathBuf,
    },
    Revoke,
    Read {
        path: String,
    },
    Search {
        query: String,
        #[arg(long,num_args=1..)]
        files: Vec<String>,
    },
    Test {
        #[arg(long,num_args=1..)]
        files: Vec<String>,
        #[arg(long,num_args=1..)]
        read_files: Vec<String>,
    },
}
#[derive(Subcommand)]
enum ConfigAction {
    Init {
        #[arg(long)]
        database_url_file: PathBuf,
        #[arg(long, default_value = "127.0.0.1:18651")]
        bind: String,
        #[arg(long, default_value = "http://127.0.0.1:18650")]
        earth_origin: String,
        #[arg(long)]
        ollama_origin: Option<String>,
        #[arg(long)]
        default_model: Option<String>,
        #[arg(long)]
        code_root: Option<PathBuf>,
        #[arg(long)]
        node_binary: Option<PathBuf>,
        #[arg(long)]
        browser_assets: Option<PathBuf>,
    },
    Show,
}
fn default_config() -> Result<PathBuf> {
    Ok(PathBuf::from(
        std::env::var_os("HOME").ok_or_else(|| anyhow::anyhow!("Set --config explicitly"))?,
    )
    .join(".local/share/finalverse-earth/intelligence-dev/config.json"))
}
pub fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}
struct Client {
    http: reqwest::Client,
    origin: String,
    token: String,
    json: bool,
}
impl Client {
    fn new(config: &Config, json: bool) -> Result<Self> {
        let origin = format!("http://{}", config.bind);
        local_origin(&origin)?;
        Ok(Self {
            http: client()?,
            origin,
            token: private_file(&config.token_files[0])?,
            json,
        })
    }
    async fn get(&self, path: &str) -> Result<Value> {
        bounded_json(
            self.http
                .get(format!("{}{}", self.origin, path))
                .bearer_auth(&self.token)
                .send()
                .await?,
            2 * 1024 * 1024,
        )
        .await
    }
    async fn post(&self, path: &str, body: Value) -> Result<Value> {
        bounded_json(
            self.http
                .post(format!("{}{}", self.origin, path))
                .bearer_auth(&self.token)
                .json(&body)
                .send()
                .await?,
            2 * 1024 * 1024,
        )
        .await
    }
    fn print(&self, value: &Value) {
        println!("{}", terminal_json(value, !self.json));
    }
    async fn create(&self, mode: Mode, title: &str) -> Result<Uuid> {
        let title: String = title.chars().filter(|c| !c.is_control()).take(60).collect();
        let value = self
            .post(
                "/v1/sessions",
                json!({"title":if title.is_empty(){"Earth conversation"}else{&title},"mode":mode}),
            )
            .await?;
        Ok(serde_json::from_value::<Session>(value)?.id)
    }
    async fn ask(
        &self,
        id: Uuid,
        text: &str,
        model: Option<String>,
        file: Option<String>,
        artifact: Option<Uuid>,
    ) -> Result<()> {
        let info = self.get(&format!("/v1/sessions/{id}")).await?;
        let cursor = info["cursor"]
            .as_i64()
            .ok_or_else(|| anyhow::anyhow!("Invalid session cursor"))?;
        let request = Uuid::new_v4();
        let value = self
            .post(
                &format!("/v1/sessions/{id}/messages"),
                json!({"request_id":request,"text":text,"model":model,"file":file,"artifact":artifact}),
            )
            .await?;
        if self.json {
            self.print(&json!({"session_id":id,"request":value}));
        } else {
            println!("Session {id} · request {request}");
        }
        self.watch(id, cursor).await
    }
    async fn watch(&self, id: Uuid, mut cursor: i64) -> Result<()> {
        // A reconnect only replays durable events; it never retries a tool POST.
        let mut attempts = 0;
        loop {
            let response = self
                .http
                .get(format!(
                    "{}/v1/sessions/{id}/events?after={cursor}",
                    self.origin
                ))
                .bearer_auth(&self.token)
                .header("Accept", "text/event-stream")
                .send()
                .await?;
            ensure!(
                response.status().is_success(),
                "Event replay refused; inspect session state"
            );
            let mut stream = response.bytes_stream();
            let mut pending = Vec::new();
            loop {
                let chunk = tokio::select! {
                    _=tokio::signal::ctrl_c()=>{
                        let _=self.post(&format!("/v1/sessions/{id}/cancel"),json!({})).await;
                        if !self.json{eprintln!("Cancellation requested; inspect receipts before retrying any tool.");}
                        return Ok(());
                    },
                    chunk=stream.next()=>chunk,
                };
                let Some(chunk) = chunk else { break };
                let chunk = match chunk {
                    Ok(value) => value,
                    Err(_) => break,
                };
                pending.extend_from_slice(&chunk);
                ensure!(pending.len() <= 65536, "Event frame budget");
                while let Some(position) = pending.windows(2).position(|s| s == b"\n\n") {
                    let frame: Vec<u8> = pending.drain(..position + 2).collect();
                    let frame = std::str::from_utf8(&frame)?;
                    for line in frame.lines().filter_map(|line| line.strip_prefix("data: ")) {
                        let event: Event = serde_json::from_str(line)?;
                        ensure!(
                            event.protocol_version == PROTOCOL
                                && event.session_id == id
                                && event.sequence == cursor + 1,
                            "Noncontiguous or incompatible event stream"
                        );
                        cursor = event.sequence;
                        if self.json {
                            self.print(&serde_json::to_value(&event)?);
                        } else {
                            match &event.body {
                                EventBody::MessageDelta { text } => {
                                    print!("{}",text.chars().filter(|c| !c.is_control() || matches!(c,'\n'|'\t')).filter(|c| !matches!(c,'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}')).collect::<String>());
                                    std::io::stdout().flush()?;
                                }
                                EventBody::MessageStarted { model, .. } => {
                                    println!("Model {model} · local only")
                                }
                                EventBody::WorkspaceUpdated { artifact_id, .. } => println!(
                                    "\nSpatial workspace {artifact_id} is ready. Use earth workspace export/share --session {id}."
                                ),
                                EventBody::ToolCompleted {
                                    artifact_id,
                                    receipt,
                                    ..
                                } => println!(
                                    "\nTool completed · artifact {artifact_id}\n{}",
                                    serde_json::to_string_pretty(receipt)?
                                ),
                                EventBody::ToolFailed { code, outcome } => {
                                    eprintln!("\n{code}: {outcome}")
                                }
                                EventBody::SessionCancelled { reason } => eprintln!("\n{reason}"),
                                _ => {}
                            }
                        }
                        if matches!(event.body, EventBody::ApprovalRequired { .. }) {
                            let value = self.get(&format!("/v1/sessions/{id}/pending")).await?;
                            self.print(&value);
                            if !self.json {
                                println!(
                                    "Review required. Use /approve <proposal-id> here, or earth sessions approve <proposal-id> --sha256 <digest> --session {id}."
                                );
                            }
                            return Ok(());
                        }
                        if matches!(event.body, EventBody::ToolFailed { .. }) {
                            anyhow::bail!(
                                "Request failed; inspect its durable events and pending approvals. No success is assumed."
                            );
                        }
                        if matches!(
                            event.body,
                            EventBody::SessionCompleted { .. } | EventBody::SessionCancelled { .. }
                        ) {
                            if !self.json {
                                println!();
                            }
                            return Ok(());
                        }
                    }
                }
            }
            attempts += 1;
            ensure!(
                attempts <= 2,
                "Event connection ended; resume this session with --session. No request was replayed."
            );
        }
    }
}

pub async fn run(args: Args) -> Result<()> {
    let config_path = args.config.clone().map(Ok).unwrap_or_else(default_config)?;
    if let Some(Command::Config { action }) = &args.command {
        if let Some(ConfigAction::Init {
            database_url_file,
            bind,
            earth_origin,
            ollama_origin,
            default_model,
            code_root,
            node_binary,
            browser_assets,
        }) = action
        {
            ensure!(
                !config_path.exists(),
                "Configuration already exists; refusing overwrite"
            );
            let parent = config_path
                .parent()
                .ok_or_else(|| anyhow::anyhow!("Configuration needs a parent directory"))?;
            let mut directory = std::fs::DirBuilder::new();
            directory.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                directory.mode(0o700);
            }
            directory.create(parent)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                ensure!(
                    std::fs::metadata(parent)?.permissions().mode() & 0o077 == 0,
                    "Use a private configuration directory"
                );
            }
            let token_file = parent.join("owner-token");
            let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
            let config = Config {
                bridge: None,
                bind: bind.clone(),
                token_files: vec![token_file.clone()],
                database_url_file: std::fs::canonicalize(database_url_file)?,
                earth_origin: earth_origin.clone(),
                ollama_origin: ollama_origin.clone(),
                default_model: default_model.clone(),
                code_root: code_root.clone(),
                node_binary: node_binary.clone(),
                browser_assets: browser_assets.clone(),
                retention_days: 7,
            };
            config.validate_structure()?;
            private_file(&config.database_url_file)?;
            if let Some(root) = &config.code_root {
                crate::coding::Coding::new(root, config.node_binary.as_deref())?;
            }
            let serialized = serde_json::to_vec_pretty(&config)?;
            write_private(&token_file, token.as_bytes())?;
            if let Err(error) = write_private(&config_path, &serialized) {
                let _ = std::fs::remove_file(&token_file);
                return Err(error);
            }
            Config::load(&config_path)?;
            println!(
                "{}",
                json!({"configuration":config_path,"credential_values_printed":false,"next":"earthd --config <configuration path>"})
            );
            return Ok(());
        }
        println!(
            "{}",
            serde_json::to_string_pretty(&Config::load(&config_path)?)?
        );
        return Ok(());
    }
    let config = Config::load(&config_path)?;
    let client = Client::new(&config, args.json)?;
    let id = || {
        args.session
            .ok_or_else(|| anyhow::anyhow!("Supply --session <UUID>"))
    };
    match args.command {
        Some(Command::Experience { action }) => match action {
            ExperienceAction::List => client.print(
                &client
                    .get(&format!("/v1/sessions/{}/experiences", id()?))
                    .await?,
            ),
            ExperienceAction::Plan {
                request,
                grid,
                region,
                virtual_only,
                request_id,
                output,
            } => {
                ensure!(
                    std::fs::symlink_metadata(&output).is_err(),
                    "Choose a new export path"
                );
                let session = if virtual_only {
                    match args.session {
                        Some(s) => s,
                        None => {
                            client
                                .create(Mode::Chat, "Virtual experience proposal")
                                .await?
                        }
                    }
                } else {
                    id()?
                };
                let request_id = request_id.unwrap_or_else(Uuid::new_v4);
                client.print(&json!({"session_id":session,"request_id":request_id,"planning":true,"native_world_mutation":false}));
                let value=client.post(&format!("/v1/sessions/{session}/experiences"),json!({"request_id":request_id,"request":request,"layout":if virtual_only{"virtual"}else{"schematic_exhibition"},"audience":{"grid_id":grid,"region_id":region},"model":args.model})).await?;
                write_private(&output, &serde_json::to_vec_pretty(&value)?)?;
                client.print(&json!({"session_id":session,"experience_id":value["experience_id"],"manifest_sha256":value["manifest_sha256"],"proposal_file":output,"native_approval_required":true}));
            }
            ExperienceAction::Inspect { id } => {
                client.print(&client.get(&format!("/v1/experiences/{id}")).await?)
            }
            ExperienceAction::Handoff { id, agent, output } => {
                ensure!(
                    std::fs::symlink_metadata(&output).is_err(),
                    "Choose a new handoff path"
                );
                let value = client
                    .post(
                        &format!("/v1/experiences/{id}/handoff"),
                        json!({"agent_id":agent}),
                    )
                    .await?;
                write_private(&output, &serde_json::to_vec_pretty(&value)?)?;
                // A handoff is a secret. Even --json only prints its file path.
                client.print(&json!({"grant_id":value["grant_id"],"expires_at":value["expires_at"],"handoff_file":output,"next":"Native Create → Earth → World; paste the file's token, review and approve. Never place it in a URL."}));
            }
            ExperienceAction::Revoke { id, grant } => client.print(
                &client
                    .post(
                        &format!("/v1/experiences/{id}/grants/{grant}/revoke"),
                        json!({}),
                    )
                    .await?,
            ),
        },
        Some(Command::Datasets) => client.print(&client.get("/v1/earth/datasets").await?),
        Some(Command::Places { query }) => {
            let encoded = reqwest::Url::parse_with_params("http://127.0.0.1/", [("query", query)])?;
            client.print(
                &client
                    .get(&format!("/v1/earth/places?{}", encoded.query().unwrap()))
                    .await?,
            );
        }
        Some(Command::Models) => client.print(&client.get("/v1/models").await?),
        Some(Command::Doctor) => {
            let runtime = client.get("/healthz").await;
            let models = client.get("/v1/models").await;
            let earth = crate::spatial::Earth::new(&config.earth_origin)?
                .health()
                .await;
            client.print(&json!({"runtime_ready":runtime.is_ok(),"model_discovery":models.is_ok(),"earth_ready":earth.is_ok(),"privacy":"local-only","public_listener":false,"configuration":config_path}));
            ensure!(
                runtime.is_ok() && earth.is_ok(),
                "Doctor found an unavailable local dependency"
            );
        }
        Some(Command::Ask { question }) => {
            let session = match args.session {
                Some(id) => id,
                None => client.create(args.mode.into(), &question).await?,
            };
            client
                .ask(session, &question, args.model, args.file, args.artifact)
                .await?;
        }
        Some(Command::Sessions { action }) => match action {
            None => client.print(&client.get("/v1/sessions").await?),
            Some(SessionAction::Show) => {
                client.print(&client.get(&format!("/v1/sessions/{}", id()?)).await?)
            }
            Some(SessionAction::Pending) => client.print(
                &client
                    .get(&format!("/v1/sessions/{}/pending", id()?))
                    .await?,
            ),
            Some(SessionAction::Cancel) => client.print(
                &client
                    .post(&format!("/v1/sessions/{}/cancel", id()?), json!({}))
                    .await?,
            ),
            Some(SessionAction::Artifact { id: artifact }) => client.print(
                &client
                    .get(&format!("/v1/sessions/{}/artifacts/{artifact}", id()?))
                    .await?,
            ),
            Some(SessionAction::Approve { proposal, sha256 }) => {
                let session = id()?;
                let info = client.get(&format!("/v1/sessions/{session}")).await?;
                client
                    .post(
                        &format!("/v1/sessions/{session}/approve"),
                        json!({"proposal_id":proposal,"sha256":sha256}),
                    )
                    .await?;
                client
                    .watch(session, info["cursor"].as_i64().unwrap())
                    .await?;
            }
            Some(SessionAction::Export { output }) => {
                let session = id()?;
                let metadata = client.get(&format!("/v1/sessions/{session}")).await?;
                let mut cursor = 0;
                let mut events = Vec::new();
                loop {
                    let page = client
                        .get(&format!("/v1/sessions/{session}/events?after={cursor}"))
                        .await?;
                    let rows = page["events"]
                        .as_array()
                        .ok_or_else(|| anyhow::anyhow!("Invalid replay page"))?;
                    if rows.is_empty() {
                        break;
                    }
                    events.extend(rows.iter().cloned());
                    cursor = page["cursor"].as_i64().unwrap();
                    ensure!(events.len() <= 4096, "Export event budget");
                }
                let artifacts = client
                    .get(&format!("/v1/sessions/{session}/artifacts"))
                    .await?;
                write_private(
                    &output,
                    &serde_json::to_vec_pretty(
                        &json!({"protocol_version":PROTOCOL,"session":metadata,"events":events,"artifacts":artifacts,"private_export":true}),
                    )?,
                )?;
                client.print(&json!({"saved":output,"private":true}));
            }
        },
        Some(Command::Workspace { action }) => {
            let session = id()?;
            match action {
                None=>client.print(&client.get(&format!("/v1/sessions/{session}/artifacts")).await?),
                Some(WorkspaceAction::Export{output})=>{let value=client.get(&format!("/v1/sessions/{session}/workspace")).await?;write_private(&output,&serde_json::to_vec_pretty(&value)?)?;client.print(&json!({"saved":output,"query_reexecuted":false}));},
                Some(WorkspaceAction::Share{output})=>{let value=client.post(&format!("/v1/sessions/{session}/share"),json!({})).await?;write_private(&output,&serde_json::to_vec_pretty(&value)?)?;client.print(&json!({"private_share_file":output,"open":format!("{}/",client.origin),"scope":"explicit spatial artifact only","expires_in_seconds":3600}));},
                Some(WorkspaceAction::Revoke)=>client.print(&client.post(&format!("/v1/sessions/{session}/revoke"),json!({})).await?),
                Some(WorkspaceAction::Read{path})=>client.print(&client.post(&format!("/v1/sessions/{session}/code/read"),json!({"path":path})).await?),
                Some(WorkspaceAction::Search{query,files})=>client.print(&client.post(&format!("/v1/sessions/{session}/code/search"),json!({"files":files,"query":query})).await?),
                Some(WorkspaceAction::Test{files,read_files})=>client.print(&client.post(&format!("/v1/sessions/{session}/proposals"),json!({"request_id":Uuid::new_v4(),"tool":Tool::NodeTest{files,read_files}})).await?),
            }
        }
        Some(Command::Config { .. }) => unreachable!(),
        None => {
            let mut session = match args.session {
                Some(id) => id,
                None => {
                    client
                        .create(args.mode.into(), "Earth conversation")
                        .await?
                }
            };
            let session_info = client.get(&format!("/v1/sessions/{session}")).await?;
            let mut mode = match session_info["mode"].as_str() {
                Some("code") => CliMode::Code,
                Some("spatial") => CliMode::Spatial,
                _ => CliMode::Chat,
            };
            let mut file = args.file;
            if !args.json {
                println!(
                    "\nFINALVERSE EARTH · INTELLIGENCE\nLocal models · PostgreSQL sessions · approved tools\nSession {session}\n/help for commands. Spatial defaults: 100 km radius, 10 km group edge.\n"
                );
            }
            loop {
                if !args.json {
                    print!("earth> ");
                    std::io::stdout().flush()?;
                }
                let mut line = String::new();
                if std::io::stdin().read_line(&mut line)? == 0 {
                    break;
                }
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                if line == "/exit" {
                    break;
                }
                let result:Result<()>=async {
                    if line=="/help"{println!("/models /sessions /resume UUID /mode chat|spatial|code /file relative.js /pending /approve UUID /cancel /workspace /exit\nRead the pending JSON and SHA-256 before /approve. No shell command syntax is supported.");}
                    else if line=="/models"{client.print(&client.get("/v1/models").await?);}
                    else if line=="/sessions"{client.print(&client.get("/v1/sessions").await?);}
                    else if let Some(value)=line.strip_prefix("/resume "){let id=Uuid::parse_str(value)?;let info=client.get(&format!("/v1/sessions/{id}")).await?;mode=match info["mode"].as_str(){Some("code")=>CliMode::Code,Some("spatial")=>CliMode::Spatial,_=>CliMode::Chat};session=id;}
                    else if let Some(value)=line.strip_prefix("/mode "){mode=match value{"chat"=>CliMode::Chat,"spatial"=>CliMode::Spatial,"code"=>CliMode::Code,_=>anyhow::bail!("Choose chat, spatial or code")};session=client.create(mode.into(),"Earth conversation").await?;}
                    else if let Some(value)=line.strip_prefix("/file "){crate::coding::relative(value)?;file=Some(value.into());}
                    else if line=="/pending"{client.print(&client.get(&format!("/v1/sessions/{session}/pending")).await?);}
                    else if line=="/cancel"{client.print(&client.post(&format!("/v1/sessions/{session}/cancel"),json!({})).await?);}
                    else if line=="/workspace"{client.print(&client.get(&format!("/v1/sessions/{session}/workspace")).await?);}
                    else if let Some(value)=line.strip_prefix("/approve "){
                        let proposal=Uuid::parse_str(value)?;
                        let pending=client.get(&format!("/v1/sessions/{session}/pending")).await?;
                        let entry=pending["proposals"].as_array().and_then(|rows|rows.iter().find(|p|p["id"]==proposal.to_string())).ok_or_else(||anyhow::anyhow!("Proposal unavailable"))?;
                        let info=client.get(&format!("/v1/sessions/{session}")).await?;
                        client.post(&format!("/v1/sessions/{session}/approve"),json!({"proposal_id":proposal,"sha256":entry["sha256"]})).await?;
                        client.watch(session,info["cursor"].as_i64().unwrap()).await?;
                    }
                    else if line.starts_with('/') {anyhow::bail!("Unsupported command; use /help");}
                    else {client.ask(session,line,args.model.clone(),if matches!(mode,CliMode::Code){file.clone()}else{None},args.artifact).await?;}
                    Ok(())
                }.await;
                if result.is_err() {
                    eprintln!(
                        "Request refused or connection interrupted. Inspect /pending and receipts before retrying."
                    );
                }
            }
        }
    }
    Ok(())
}

// Escape display-control characters while preserving the exact JSON value.
// In particular, a model patch cannot visually reverse its own approval text.
fn terminal_json(value: &Value, pretty: bool) -> String {
    let encoded = if pretty {
        serde_json::to_string_pretty(value).unwrap()
    } else {
        serde_json::to_string(value).unwrap()
    };
    encoded.chars().map(|c|if matches!(c,'\u{0080}'..='\u{009f}'|'\u{061c}'|'\u{200e}'|'\u{200f}'|'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}') {format!("\\u{:04x}",c as u32)}else{c.to_string()}).collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn untrusted_approval_json_cannot_spoof_terminal_direction_and_still_roundtrips() {
        let value = json!({"content":"safe\u{202e}reversed\u{2066}text\u{0085}next\u{001b}[2J","path":"source.js"});
        for pretty in [false, true] {
            let text = terminal_json(&value, pretty);
            assert!(
                !text.contains('\u{202e}')
                    && !text.contains('\u{2066}')
                    && !text.contains('\u{0085}')
                    && !text.contains('\u{001b}')
            );
            assert_eq!(serde_json::from_str::<Value>(&text).unwrap(), value);
        }
    }
}
