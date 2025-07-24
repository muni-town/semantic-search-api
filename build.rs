fn main() {
    let prefix = std::env::var("CONDA_PREFIX").unwrap();
    println!("cargo::rerun-if-env-changed=CONDA_PREFIX");
    println!("cargo:rustc-link-search=native={}/lib", prefix)
}
