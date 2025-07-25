# Semantic Search API

> 🚧 **Warning:** This is extremely new and work-in-progress. It is not stable, but might still be
> useful, especially for quick experimentation with semantic search.

A very simple, opinionated, and easy-to-use API for semantic search. Allows you to use basic HTTP
API calls to index and search items you have stored in an external database or store.

It uses [Qdrant](https://qdrant.tech/) as the search backend and implements the semantic embedding
itself using the
[mixedbread-ai/mxbai-embed-xsmall-v1](https://huggingface.co/mixedbread-ai/mxbai-embed-xsmall-v1)
model internally running on the CPU.

The search API is meant to make it very easy to add semantic search capability to apps or services
by making calls HTTP API on your own server. You probably don't want to expose the HTTP API directly
to the internet because there is no authorization or authentication, but you can use it as a
supporting service in your own app deployment.

## API

The API is extremely simple. The API will probably be adapted to allow for searching specific
collections in the future.

### `POST /index/[id]`

Index an item with the given ID. The POST body should be the text that you wish to semantically
index the object by.

The ID will usually be the unique ID used to reference the item in your database.

### `POST /search`

Search for items indexed by a similar search text. The POST body should be the text to search by.

The endpoint will return a list of items with their ID and the similarity score to your search text:

```json
[
  { "id": "6ca300b5-c075-4084-a93c-88ae7bc90b8a", "score": 0.49017754 },
  { "id": "810bce41-991a-45cf-ba5a-85c60e51005c", "score": 0.78214836 }
]
```

You can optionally add a `limit` query parameter which will set a limit on how many items are
returned, for example: `POST /search?limit=20`. The default limit is `10`.

## Example

The repo includes a quick example of how to use it to search a database of chat messages using Deno.

```bash
cd example

# First we need to start the search services
docker compose up -d

# Then we need to download the conversation database. That will download
# the `conversations.json` file containing a bunch of sample messages.
./download-conversations.sh

# Now we need to index the messages. This may take a while to index the 188k
# messages, but you can search the messages while they are being indexed and
# if you don't care to index all of them you can cancel it at any time and
# all of the messages that have already been indexed will still be searchable.
deno run -A indexConversations.ts

# After that's done ( or during indexing in another terminal ), we can search
# for chat messages.
deno run -A search.ts Do you like dogs?
```

Check out the scripts in the `example` folder to see how easy it is to search and index messages!

### Qdrant Dashboard

You can also access the QDrant web dashboard after running `docker compose up -d` by going to
<http://localhost:6333/dashboard#/collections>.

## Deployment

The service is easily deployed, along with Qdrant, using docker compose:

```yaml
services:
  semantic-search-api:
    image: ghcr.io/muni-town/semantic-search-api:main
    restart: unless-stopped
    ports:
      - 3000:3000
    environment:
      QDRANT_URL: http://qdrant:6334

  qdrant:
    image: qdrant/qdrant:latest
    restart: unless-stopped
    ports:
      - 6333:6333
      - 6334:6334
    volumes:
      - qdrant:/qdrant/storage

volumes:
  qdrant:
```
