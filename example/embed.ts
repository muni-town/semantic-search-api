export type Embeddings = {
  dense: number[];
  bm25: { indices: number[]; values: number[] };
};

export async function embed(message: string): Promise<Embeddings> {
  const resp = await fetch(`http://localhost:3000/embed`, {
    method: "post",
    headers: [["content-type", "application/json"]],
    body: JSON.stringify({
      text: message,
      dense: true,
      bm25: {
        avgdl: 1000,
      },
    }),
  });
  if (!resp.ok) {
    throw new Error(
      `Error ${resp.status} - ${resp.statusText}: ${await resp.text()}`
    );
  }
  return await resp.json();
}
