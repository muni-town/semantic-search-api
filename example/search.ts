import { messages } from "./conversations.ts";
import { embed } from "./embed.ts";
import { collectionName, qdrant } from "./qdrant.ts";

const query = Deno.args.join(" ");

const embeddings = await embed(query);

// Perform a hybrid search
const results = await qdrant.query(collectionName, {
  prefetch: [
    {
      query: embeddings.bm25,
      using: "bm25",
      limit: 20,
    },
    {
      query: embeddings.dense,
      using: "dense",
      limit: 10,
    },
  ],
  query: { fusion: "rrf" },
  with_payload: true,
});

console.log(results.points.reverse());
