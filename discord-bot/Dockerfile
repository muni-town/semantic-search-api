FROM node:22-alpine

# Add certificate and uncomment if building behind proxy with custom cert
COPY ./gitignore/ca-certificates.crt /etc/ssl/cert.pem

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem

COPY . /project
WORKDIR /project
RUN npm i -g pnpm
RUN pnpm i

ENTRYPOINT ["pnpm", "start"]