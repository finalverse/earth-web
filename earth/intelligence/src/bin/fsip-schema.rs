fn main() {
    println!(
        "{}",
        serde_json::to_string_pretty(&earth_intelligence::fsip::schema()).unwrap()
    );
}
