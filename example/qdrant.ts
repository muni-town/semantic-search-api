import { QdrantClient } from "npm:@qdrant/js-client-rest";

export const denseLength = 384;
export const collectionName = "messages";

export const qdrant = new QdrantClient({ host: "localhost", port: 6333 });
