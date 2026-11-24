FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-core \
    && rm -rf /var/lib/apt/lists/* \
    && install -d -o node -g node /app /app/.data \
    && install -d -m 0700 -o node -g node /app/.data/uploads

WORKDIR /app
USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node server.js report-export.js ./
COPY --chown=node:node public/ ./public/

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=7860 \
    REPORT_BROWSER_PATH=/usr/bin/chromium

EXPOSE 7860
CMD ["node", "server.js"]
