#!/bin/bash

# Download model
model=mixedbread-ai/mxbai-embed-xsmall-v1
model_filename=model_uint8
mkdir -p model
pushd model
if [ ! -f "./model.onnx" ]; then
    wget https://huggingface.co/$model/resolve/main/onnx/$model_filename.onnx   -O model.onnx
    wget https://huggingface.co/$model/resolve/main/config.json                 -O config.json
    wget https://huggingface.co/$model/resolve/main/tokenizer.json              -O tokenizer.json
    wget https://huggingface.co/$model/resolve/main/tokenizer_config.json       -O tokenizer_config.json
    wget https://huggingface.co/$model/resolve/main/special_tokens_map.json     -O special_tokens_map.json
fi
popd

# Download ORT
if [ ! -d "ort/onnxruntime" ]; then
    mkdir -p ort
    pushd ort
    wget https://cdn.pyke.io/0/pyke:ort-rs/ms@1.22.1/x86_64-unknown-linux-gnu.tgz -O ort.tgz
    tar -xf ort.tgz
    rm ort.tgz
    echo "Set this environment variable before building:\nORT_LIB_LOCATION=ort/onnxruntime/lib"
    popd
fi

