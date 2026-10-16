# syntax=docker/dockerfile:1

# Merran: one image. Today it serves the API; the web app joins it later.
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

# ---- Runtime ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=3000 \
    MERRAN_DATA_DIR=/data

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
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/merran-entrypoint
RUN mkdir -p /data

EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["merran-entrypoint"]
CMD ["node", "apps/server/src/index.ts"]
