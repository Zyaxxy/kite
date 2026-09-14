//! Generate the IDL from the compiled Anchor macros, without a wallet or deployment.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let idl = anchor_lang_idl::build::IdlBuilder::new()
        .program_path(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")))
        .resolution(true)
        .skip_lint(false)
        .build()?;
    println!("{}", serde_json::to_string_pretty(&idl)?);
    Ok(())
}
