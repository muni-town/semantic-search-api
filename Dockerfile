FROM rust:1.87 AS build

# Add certificate and uncomment if building behind proxy with custom cert
# COPY ./gitignore/ca-certificates.crt /usr/local/share/ca-certificates/ca.crt
# RUN update-ca-certificates

COPY . /project
WORKDIR /project
RUN --mount=type=cache,target=/project/model \
    --mount=type=cache,target=/project/ort \
    pwd && \
    ./download-deps.sh && \
    cp -r model /model
ENV ORT_LIB_LOCATION=/project/ort/onnxruntime/lib
RUN --mount=type=cache,target=/project/target \
    --mount=type=cache,target=/project/ort \
    --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo b --release && \
    cp target/release/embedding-api /

FROM debian:bookworm
ENV LD_LIBRARY_PATH=/
COPY --from=build /embedding-api /
COPY --from=build /model /model
ENTRYPOINT ["/embedding-api"]

