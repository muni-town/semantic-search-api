import { messages } from "./conversations.ts";
import { embed } from "./embed.ts";
import { qdrant, collectionName, denseLength } from "./qdrant.ts";

await qdrant.deleteCollection(collectionName);
await qdrant.createCollection(collectionName, {
  vectors: {
    dense: {
      size: denseLength,
      distance: "Cosine",
      on_disk: true,
    },
  },
  sparse_vectors: {
    bm25: {},
  },
});

for (let i = 0; i < messages.length; i++) {
  const message = messages[i];
  const embeddings = await embed(message);
  try {
    await qdrant.upsert(collectionName, {
      points: [
        {
          id: i,
          vector: {
            dense: embeddings.dense,
            bm25: {
              indices: embeddings.bm25.indices,
              values: embeddings.bm25.values,
            },
          },
          payload: {
            message,
          },
        },
      ],
    });
  } catch (e) {
    console.error(e);
  }
}
