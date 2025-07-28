FROM node:22-alpine AS builder

# Add certificate and uncomment if building behind proxy with custom cert
# COPY ./gitignore/ca-certificates.crt /etc/ssl/cert.pem
# ENV NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem

COPY . /project
WORKDIR /project
RUN npm i -g pnpm
RUN pnpm i
RUN pnpm run build

FROM nginx:latest

COPY --from=builder /project/dist /usr/share/nginx/html

ENV SEARCH_ENDPOINT=http://localhost:3001

COPY ui-docker-entrypoint.sh /docker-entrypoint.d/