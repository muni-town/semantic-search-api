FROM node:22-alpine AS builder

# Add certificate and uncomment if building behind proxy with custom cert
COPY ./gitignore/ca-certificates.crt /etc/ssl/cert.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem

COPY . /project
WORKDIR /project
RUN npm i -g pnpm
RUN pnpm i
RUN pnpm build

FROM node:22-alpine

RUN mkdir /project
WORKDIR /project
COPY --from=builder /project/node_modules /project/node_modules
COPY --from=builder /project/package.json /project/package.json
COPY --from=builder /project/dist /project/dist

ENV PORT=3001
ENV DATA_DIR=/data
ENV EMBEDDING_SERVICE=http://embedding-service:3000
ENV QDRANT_HOST=qdrant
ENV QDRANT_PORT=6333

ENTRYPOINT ["node", "dist/main.js"]