import { messages } from "./conversations.ts";

for (let i = 0; i < messages.length; i++) {
  const message = messages[i];
  await fetch(`http://localhost:3000/index/${i}`, {
    method: "post",
    body: message,
  });
}
