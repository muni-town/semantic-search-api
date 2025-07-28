#!/bin/sh

echo "{
    \"searchEndpoint\": \"${SEARCH_ENDPOINT}\"
}" > /usr/share/nginx/html/config.json
