import "./httpProxy";

import "dotenv/config";
import { createBot, Intents } from "@discordeno/bot";

const bot = createBot({
  token: process.env.TOKEN,
  intents: Intents.MessageContent | Intents.Guilds | Intents.GuildMessages,
  desiredProperties: {
    message: {
      id: true,
      guildId: true,
      content: true,
    },
  },
  events: {
    ready: (ready) => console.log(`Ready`, ready),
    messageCreate(message) {
      console.log(message);
    },
  },
});

console.log("Starting Discord bot...");
bot.start();
