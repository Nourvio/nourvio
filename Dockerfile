# syntax=docker/dockerfile:1

# Mise: one image that serves the web app and the API.
# Build it from a checkout (`docker build .`) or straight from GitHub
# (`docker build https://github.com/kjohnson2719/mise.git#main`).

# ---- Build the web app ----
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @mise/web

# ---- Production dependencies for the server only ----
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev --workspace @mise/server --ignore-scripts

# ---- Runtime ----
FROM node:24-slim
ARG MISE_VERSION=dev
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    MISE_VERSION=$MISE_VERSION
WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/mise-entrypoint
# The entrypoint uses setpriv (util-linux) to drop root; install it if the base image lacks it.
RUN (command -v setpriv >/dev/null || (apt-get update \
      && apt-get install -y --no-install-recommends util-linux \
      && rm -rf /var/lib/apt/lists/*)) \
    && command -v setpriv \
    && mkdir -p /data

EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["mise-entrypoint"]
CMD ["node", "apps/server/src/index.ts"]
