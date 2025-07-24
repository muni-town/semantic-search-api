fn main() {
    let prefix = std::env::var("CONDA_PREFIX");
    if let Ok(prefix) = prefix {
        println!("cargo::rerun-if-env-changed=CONDA_PREFIX");
        println!("cargo:rustc-link-search=native={}/lib", prefix)
    }
}
