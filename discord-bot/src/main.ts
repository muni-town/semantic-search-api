import "./httpProxy.js";

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
import { AutoRouter, cors, json } from "itty-router";
import { embed } from "./embed.js";
import { collectionName, denseLength, qdrant } from "./qdrant.js";

import { v5 as uuidv5 } from "uuid";
const ID_NAMESPACE = "75128e0b-d05b-4396-b065-f6544ae036b2";

const db = new ClassicLevel(process.env.DATA_DIR || "./data", {
  valueEncoding: "json",
});
const indexedIds = db.sublevel<string, boolean>("indexedIds", {
  valueEncoding: "json",
});
const latestMessagesForChannel = db.sublevel<string, string>(
  "latestMessagesForChannel",
  {}
);

function messageIdToString(channelId: bigint, messageId: bigint): string {
  return `${channelId.toString()}:${messageId.toString()}`;
}

async function hasIndexed(
  channelId: bigint,
  messageId: bigint
): Promise<boolean> {
  return await indexedIds.has(messageIdToString(channelId, messageId));
}
async function setIndexed(channelId: bigint, messageId: bigint) {
  await indexedIds.put(messageIdToString(channelId, messageId), true);
}

async function indexMessage(
  guildId: bigint,
  channelId: bigint,
  messageId: bigint,
  text: string,
  authorUsername: string
) {
  if (await hasIndexed(channelId, messageId)) return;
  if (text.length > 0) {
    const embeddings = await embed(text);

    try {
      await qdrant.upsert(collectionName, {
        points: [
          {
            id: uuidv5(messageIdToString(channelId, messageId), ID_NAMESPACE),
            vector: {
              dense: embeddings.dense,
              bm25: embeddings.bm25
                ? {
                    indices: embeddings.bm25.indices,
                    values: embeddings.bm25.values,
                  }
                : undefined,
            },
            payload: {
              message: {
                id: messageId,
                text,
              },
              channel: {
                id: channelId,
              },
              guild: {
                id: guildId,
              },
              author: {
                username: authorUsername,
              },
            },
          },
        ],
      });

      await setIndexed(channelId, messageId);
    } catch (e) {
      console.error("Error indexing message:", e);
    }
  }
}

async function searchMessages(
  text: string,
  {
    dense,
    bm25,
    filter,
    offset,
  }: { dense: boolean; bm25: boolean; filter: boolean; offset: number }
): Promise<
  {
    guildId: bigint;
    channelId: bigint;
    messageId: bigint;
    score: number;
    author: string;
    text: string;
  }[]
> {
  const embeddings = await embed(text, { dense, bm25 });

  const query = {
    prefetch: [
      embeddings.bm25
        ? {
            query: embeddings.bm25,
            using: "bm25",
            limit: 20,
          }
        : undefined,
      embeddings.dense
        ? {
            query: embeddings.dense,
            using: "dense",
            limit: 20,
          }
        : undefined,
    ].filter((x) => !!x),
    query: { fusion: "rrf" },
    with_payload: true,
    filter: filter
      ? {
          must: [
            {
              key: "message.text",
              match: {
                text,
              },
            },
          ],
        }
      : undefined,
    offset,
  } satisfies Parameters<(typeof qdrant)["query"]>[1];
  const results = await qdrant.query(collectionName, query);

  return await Promise.all(
    results.points.map(async (x) => {
      return {
        score: x.score,
        channelId: (x.payload as any).channel.id,
        messageId: (x.payload as any).message.id,
        guildId: (x.payload as any).guild.id,
        author: (x.payload as any).author.username,
        text: (x.payload as any).message.text,
      };
    })
  );
}

const { preflight, corsify } = cors();

const router = AutoRouter({
  before: [preflight],
  finally: [corsify],
});
router.post("/search", async ({ text, query }) => {
  const search = await searchMessages(await text(), {
    bm25: query.bm25 == "true" || !query.bm25,
    dense: query.dense == "true" || !query.dense,
    filter: query.filter == "true",
    offset:
      query.offset && typeof query.offset == "string"
        ? parseInt(query.offset)
        : 0,
  });
  const results = search.map((x) => {
    return {
      score: x.score,
      channelId: x.channelId.toString(),
      messageId: x.messageId.toString(),
      guildId: x.guildId.toString(),
      content: x.text,
      author: x.author,
      link: `https://discord.com/channels/${x.guildId.toString()}/${x.channelId.toString()}/${x.messageId.toString()}`,
    };
  });
  return json(results);
});
const ittyServer = createServerAdapter(router.fetch);
// then pass that to Node
const httpServer = createServer(ittyServer);
httpServer.listen(process.env.PORT ? parseInt(process.env.PORT) : 3001);

let doneBackfilling = false;

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

      // Create qdrant collection if it doesn't exist.
      const collection = await qdrant.collectionExists(collectionName);
      if (!collection.exists) {
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
          hnsw_config: {
            on_disk: true,
            m: 24,
          },
        });
        await qdrant.createPayloadIndex(collectionName, {
          field_name: "message.text",
          field_schema: {
            type: "text",
            lowercase: true,
            tokenizer: "prefix",
          },
        });
      }

      // await bot.helpers.upsertGlobalApplicationCommands([
      //   {
      //     type: ApplicationCommandTypes.ChatInput,
      //     name: "search",
      //     description:
      //       "Search all discord messages, way better than Discord's normal search",
      //     options: [
      //       {
      //         name: "text",
      //         description: "The text to search messages by",
      //         type: ApplicationCommandOptionTypes.String,
      //       },
      //     ],
      //     integrationTypes: [DiscordApplicationIntegrationType.GuildInstall],
      //     contexts: [
      //       DiscordInteractionContextType.Guild,
      //       DiscordInteractionContextType.BotDm,
      //     ],
      //   },
      // ]);

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
      doneBackfilling = true;
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

      if (doneBackfilling) {
        await latestMessagesForChannel.put(
          message.channelId.toString(),
          message.id.toString()
        );
      }
    },
    // async interactionCreate(interaction) {
    //   if (interaction.type == InteractionTypes.ApplicationCommand) {
    //     if (interaction.data?.name == "search") {
    //       const query = interaction.data.options?.find((x) => x.name == "text")
    //         ?.value as string;
    //       const results = await searchMessages(query, {
    //         bm25: true,
    //         dense: true,
    //         filter: false,
    //         offset: 0,
    //       });

    //       const embeds: DiscordEmbed[] = await Promise.all(
    //         results
    //           .reverse()
    //           .filter((x) => x.score > 0.2)
    //           .map(async (x) => {
    //             return {
    //               type: "link",
    //               url: `http://discord.com/channels/${x.guildId.toString()}/${x.channelId.toString()}/${x.messageId.toString()}`,
    //               title: x.author,
    //               description: x.text,
    //             };
    //           })
    //       );

    //       interaction.respond({
    //         flags: MessageFlags.Ephemeral,
    //         embeds,
    //       });
    //     }
    //   }
    // },
  },
});

console.log("Starting Discord bot...");
bot.start();
