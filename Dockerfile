FROM node:24.22.1-trixie-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends heif-thumbnailer libheif-plugin-libde265 libheif-plugin-aomdec util-linux && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm test && npm run test:images && npm run typecheck && npm run build

FROM base AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 TZ=America/Guayaquil
COPY --chown=node:node LICENSE NOTICE ./
COPY --chown=node:node src/server/wordlists/README.md ./src/server/wordlists/README.md
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/package.json /app/next.config.mjs /app/server.mjs ./
COPY --from=build --chown=node:node /app/scripts/pwa.mjs ./scripts/pwa.mjs
COPY --from=build --chown=node:node /app/src/server/request-network.mjs ./src/server/request-network.mjs
COPY --from=build --chown=node:node /app/src/server/logger.mjs ./src/server/logger.mjs
COPY --from=build --chown=node:node /app/src/server/startup.mjs ./src/server/startup.mjs
COPY --from=build --chown=node:node /app/src/domain/*.mjs ./src/domain/
COPY --from=build --chown=node:node /app/src/server/photo-*.mjs /app/src/server/decode-heic.mjs /app/src/server/native-heic.mjs ./src/server/
COPY --from=build --chown=node:node /app/src/server/postgres/*.mjs ./src/server/postgres/
COPY --from=build --chown=node:node /app/db/001_initial.sql ./db/001_initial.sql
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
