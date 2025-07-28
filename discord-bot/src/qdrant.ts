import { QdrantClient } from "@qdrant/js-client-rest";

export const denseLength = 384;
export const collectionName = "messages";

export const qdrant = new QdrantClient({
  host: process.env.QDRANT_HOST || "localhost",
  port: process.env.QDRANT_PORT ? parseInt(process.env.QDRANT_PORT) : 6333,
});
