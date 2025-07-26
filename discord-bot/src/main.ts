import "./httpProxy";

import "dotenv/config";
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  ChannelTypes,
  createBot,
  DiscordApplicationIntegrationType,
  DiscordEmbed,
  DiscordInteractionContextType,
  Intents,
  InteractionTypes,
  MessageFlags,
} from "@discordeno/bot";
import { ClassicLevel } from "classic-level";

import { createServerAdapter } from "@whatwg-node/server";
import { createServer } from "http";
import { AutoRouter, json } from "itty-router";

const searchApi = process.env.SEARCH_API;

const db = new ClassicLevel("./data", { valueEncoding: "json" });
const indexedIds = db.sublevel<string, string>("indexedIds", {
  valueEncoding: "json",
});
const latestMessagesForChannel = db.sublevel<string, string>(
  "latestMessagesForChannel",
  {}
);

function messageIdToString(channelId: bigint, messageId: bigint): string {
  return `${channelId.toString()}:${messageId.toString()}`;
}
function messageIdFromString(id: string): {
  channelId: bigint;
  messageId: bigint;
} {
  const ids = id.split(":").map(BigInt);
  if (ids.length !== 2) {
    console.error("Could not parse channel and message ID from string:", id);
  }
  return { channelId: ids[0], messageId: ids[1] };
}

async function hasIndexed(
  channelId: bigint,
  messageId: bigint
): Promise<boolean> {
  return await indexedIds.has(messageIdToString(channelId, messageId));
}
async function getIndexedGuild(
  channelId: bigint,
  messageId: bigint
): Promise<bigint | undefined> {
  const s = await indexedIds.get(messageIdToString(channelId, messageId));
  return s ? BigInt(s) : undefined;
}
async function setIndexed(
  guildId: bigint,
  channelId: bigint,
  messageId: bigint
) {
  await indexedIds.put(
    messageIdToString(channelId, messageId),
    guildId.toString()
  );
}

async function indexMessage(
  guildId: bigint,
  channelId: bigint,
  messageId: bigint,
  text: string,
  author: string
) {
  if (await hasIndexed(channelId, messageId)) return;
  if (text.length > 0) {
    const resp = await fetch(
      `${searchApi}/index/${messageIdToString(channelId, messageId)}`,
      {
        method: "post",
        headers: [["content-type", "application/json"]],
        body: JSON.stringify({
          text,
          metadata: {
            author,
            text,
          },
        }),
      }
    );
    if (resp.ok) {
      await setIndexed(guildId, channelId, messageId);
    } else {
      console.error("Error indexing message.", resp.status, await resp.text());
    }
  }
}

async function searchMessages(text: string): Promise<
  {
    guildId: bigint;
    channelId: bigint;
    messageId: bigint;
    score: number;
    author: string;
    text: string;
  }[]
> {
  const resp = await fetch("http://localhost:3000/search?limit=10", {
    method: "post",
    body: text,
  });

  const results: {
    id: string;
    score: number;
    metadata: { author: string; text: string };
  }[] = await resp.json();

  return await Promise.all(
    results.map(async (x) => {
      const { channelId, messageId } = messageIdFromString(x.id);
      const guildId = await getIndexedGuild(channelId, messageId);
      return {
        score: x.score,
        channelId,
        messageId,
        guildId: guildId!,
        author: x.metadata.author,
        text: x.metadata.text,
      };
    })
  );
}

const bot = createBot({
  token: process.env.TOKEN!,
  intents: Intents.MessageContent | Intents.Guilds | Intents.GuildMessages,
  desiredProperties: {
    message: {
      id: true,
      guildId: true,
      content: true,
      channelId: true,
      author: true,
    },
    guild: {
      channels: true,
    },
    channel: {
      id: true,
      lastMessageId: true,
      name: true,
      type: true,
    },
    user: {
      username: true,
    },
    interaction: {
      id: true,
      type: true,
      data: true,
      token: true,
    },
  },
  events: {
    ready: async (ready) => {
      console.log(`Ready`, ready);

      await bot.helpers.upsertGlobalApplicationCommands([
        {
          type: ApplicationCommandTypes.ChatInput,
          name: "search",
          description:
            "Search all discord messages, way better than Discord's normal search",
          options: [
            {
              name: "text",
              description: "The text to search messages by",
              type: ApplicationCommandOptionTypes.String,
            },
          ],
          integrationTypes: [DiscordApplicationIntegrationType.GuildInstall],
          contexts: [
            DiscordInteractionContextType.Guild,
            DiscordInteractionContextType.BotDm,
          ],
        },
      ]);

      const router = AutoRouter();
      router.post("/search", async ({ text }) => {
        const search = await searchMessages(await text());
        console.log("got search results, loading discord messages");
        const results = await Promise.all(
          search.map(async (x) => {
            const message = await bot.helpers.getMessage(
              x.channelId,
              x.messageId
            );
            return {
              score: x.score,
              channelId: x.channelId.toString(),
              messageId: x.messageId.toString(),
              guildId: x.guildId.toString(),
              content: message.content,
              link: `https://discord.com/channels/${x.guildId.toString()}/${x.channelId.toString()}/${x.messageId.toString()}`,
            };
          })
        );
        console.log("discord messages loaded");
        return json(results);
      });
      const ittyServer = createServerAdapter(router.fetch);
      // then pass that to Node
      const httpServer = createServer(ittyServer);
      httpServer.listen(3001);

      // For every guild the bot is in
      for (const guildId of ready.guilds) {
        console.log("backfilling guild", guildId);
        const channels = await bot.helpers.getChannels(guildId);

        // For every channel in the guild
        for (const channel of channels.filter(
          (x) =>
            x.type == ChannelTypes.GuildText ||
            x.type == ChannelTypes.PublicThread
        )) {
          try {
            console.log(
              `  backfilling channel: ${channel.name} ( ${channel.id} )`
            );

            // Track the last message we've backfilled
            const cachedLatestForChannel = await latestMessagesForChannel.get(
              channel.id.toString()
            );

            console.log("    lastKnownMessage", cachedLatestForChannel);

            let after = cachedLatestForChannel
              ? BigInt(cachedLatestForChannel)
              : "0";

            while (true) {
              // Get the next set of messages
              const messages = await bot.helpers.getMessages(channel.id, {
                after,
              });
              // console.log(messages);
              console.log(
                `    Found ${messages.length} messages since last message.`
              );

              if (messages.length == 0) break;

              // Backfill each one that we haven't indexed yet
              for (const message of messages.reverse()) {
                after = message.id;
                await indexMessage(
                  guildId,
                  channel.id,
                  message.id,
                  message.content,
                  message.author.username
                );
              }

              after &&
                (await latestMessagesForChannel.put(
                  channel.id.toString(),
                  after.toString()
                ));
            }
          } catch (e) {
            console.warn(
              "Error backfilling channel",
              channel.id,
              channel.name,
              e
            );
          }
        }
      }
    },
    messageCreate: async (message) => {
      if (!message.guildId) throw "Message missing guildId";
      await indexMessage(
        message.guildId,
        message.channelId,
        message.id,
        message.content,
        message.author.username
      );
    },
    async interactionCreate(interaction) {
      if (interaction.type == InteractionTypes.ApplicationCommand) {
        if (interaction.data?.name == "search") {
          const query = interaction.data.options?.find((x) => x.name == "text")
            ?.value as string;
          const results = await searchMessages(query);

          const embeds: DiscordEmbed[] = await Promise.all(
            results
              .reverse()
              .filter((x) => x.score > 0.2)
              .map(async (x) => {
                return {
                  type: "link",
                  url: `http://discord.com/channels/${x.guildId.toString()}/${x.channelId.toString()}/${x.messageId.toString()}`,
                  title: x.author,
                  description: x.text,
                };
              })
          );

          interaction.respond({
            flags: MessageFlags.Ephemeral,
            embeds,
          });
        }
      }
    },
  },
});

console.log("Starting Discord bot...");
bot.start();
