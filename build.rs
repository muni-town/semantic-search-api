fn main() {
  let prefix = std::env::var("CONDA_PREFIX").unwrap();
    println!("cargo:rustc-link-search=native={}/lib", prefix)
}