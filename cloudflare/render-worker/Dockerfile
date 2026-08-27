FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ffmpeg ca-certificates fonts-liberation fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./package.json
COPY packages ./packages
COPY cloudflare/render-worker/package.json ./cloudflare/render-worker/package.json

RUN npm install --omit=dev --ignore-scripts

COPY cloudflare/render-worker/server.mjs ./server.mjs

RUN mkdir -p /work /tmp/recast
EXPOSE 8080

CMD ["node", "server.mjs"]
