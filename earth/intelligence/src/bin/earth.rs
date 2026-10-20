use clap::Parser;
#[tokio::main]
async fn main() {
    if let Err(error) = earth_intelligence::cli::run(earth_intelligence::cli::Args::parse()).await {
        eprintln!("Earth: {error}");
        std::process::exit(1);
    }
}
