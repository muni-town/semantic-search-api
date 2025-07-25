const conversations: {
  [key: string]: {
    article_url: string;
    config: string;
    content: {
      message: string;
      agent: string;
      sentiment: string;
      knowledge_source: string[];
      turn_rating: string;
    }[];
  };
} = JSON.parse(await Deno.readTextFile("./conversations.json"));

export const messages: string[] = Object.values(conversations)
  .map((x) => x.content.map((x) => x.message))
  .flat();
