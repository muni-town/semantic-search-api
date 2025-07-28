export type Embeddings = {
  dense?: number[];
  bm25?: { indices: number[]; values: number[] };
};

const EMBEDDING_SERVICE =
  process.env.EMBEDDING_SERVICE || "http://localhost:3000";

export async function embed(
  message: string,
  options?: { dense?: boolean; bm25?: boolean }
): Promise<Embeddings> {
  const opts = {
    text: message,
    dense: options?.dense == undefined || options.dense == true,
    bm25:
      options?.bm25 == undefined || options.bm25 == true
        ? {
            avgdl: 1000,
          }
        : undefined,
  };
  const resp = await fetch(`${EMBEDDING_SERVICE}/embed`, {
    method: "post",
    headers: [["content-type", "application/json"]],
    body: JSON.stringify(opts),
  });
  if (!resp.ok) {
    throw new Error(
      `Error ${resp.status} - ${resp.statusText}: ${await resp.text()}`
    );
  }
  return await resp.json();
}
