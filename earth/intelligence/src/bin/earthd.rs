use clap::Parser;
#[derive(Parser)]
#[command(version, about = "Authenticated local Earth Intelligence runtime")]
struct Args {
    #[arg(long)]
    config: std::path::PathBuf,
}
#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .json()
        .with_writer(std::io::stderr)
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "earth_intelligence=info".into()),
        )
        .init();
    if earth_intelligence::daemon::serve(&Args::parse().config)
        .await
        .is_err()
    {
        eprintln!(
            "Earth runtime startup or persistence failed. Check private configuration, dedicated PostgreSQL, database ownership and occupied ports. No cloud fallback or tool replay was attempted."
        );
        std::process::exit(1);
    }
}
