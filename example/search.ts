import { messages } from "./conversations.ts";

const query = Deno.args.join(" ");

const resp = await fetch("http://localhost:3000/search?limit=20", {
  method: "post",
  body: query,
});

const results: { id: string; score: number }[] = await resp.json();

console.log(
  results
    .map((x) => ({
      message: messages[parseInt(x.id)],
      score: x.score,
    }))
    .reverse()
);
