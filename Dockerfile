# syntax=docker/dockerfile:1

# Merran: one image, serving the API and the web app.
#
#   docker build -t merran .
#   docker run -p 3000:3000 -v ./data:/data merran

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- The server's production dependencies, and nothing else ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @merran/server

# ---- The web app: static files, so it's built once, on the build machine ----
FROM --platform=$BUILDPLATFORM node:24-slim AS web
ENV PNPM_HOME=/pnpm     COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store     pnpm install --frozen-lockfile --filter @merran/web
COPY apps/web apps/web
RUN pnpm --filter @merran/web build

# ---- Runtime ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000 \
    MERRAN_DATA_DIR=/data \
    MERRAN_INSTALL_METHOD=docker

# setpriv (from util-linux) lets the entrypoint drop root after setting up
# the data folder.
RUN apt-get update \
    && apt-get install -y --no-install-recommends util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && command -v setpriv

WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/server/node_modules apps/server/node_modules
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY --from=web /app/apps/web/dist apps/web/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/merran-entrypoint
COPY --chmod=755 docker/merran.sh /usr/local/bin/merran
RUN mkdir -p /data

EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["merran-entrypoint"]
CMD ["node", "apps/server/src/index.ts"]
