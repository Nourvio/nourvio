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
ARG TARGETARCH
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    MISE_VERSION=$MISE_VERSION \
    YTDLP_PATH=/opt/yt-dlp/yt-dlp
WORKDIR /app

# Tools, before the app so this layer stays cached between app updates:
# - setpriv (util-linux), for the entrypoint to drop root
# - ffmpeg, for frames and audio from recipe videos. A static build from
#   BtbN/FFmpeg-Builds (linked from ffmpeg.org): Debian's package and its
#   libraries would add about 900 MB.
# - yt-dlp, which reads TikTok, YouTube and Instagram: the standalone nightly
#   build, which yt-dlp recommends since it keeps up with site changes fastest.
#   The app keeps it updated (see scheduleYtDlpUpdates), so the entrypoint
#   hands /opt/yt-dlp to the app user.
# Both downloads are checked against their releases' checksums.
RUN apt-get update \
    && apt-get install -y --no-install-recommends util-linux ca-certificates curl xz-utils \
    && case "$TARGETARCH" in \
         arm64) ytdlp=yt-dlp_linux_aarch64; ffmpeg=ffmpeg-master-latest-linuxarm64-gpl ;; \
         *) ytdlp=yt-dlp_linux; ffmpeg=ffmpeg-master-latest-linux64-gpl ;; \
       esac \
    && mkdir -p /tmp/tools /opt/yt-dlp && cd /tmp/tools \
    && curl -fsSLO "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/$ffmpeg.tar.xz" \
    && curl -fsSLO "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256" \
    && grep " $ffmpeg.tar.xz\$" checksums.sha256 | sha256sum -c - \
    && tar -xJf "$ffmpeg.tar.xz" --strip-components=2 -C /usr/local/bin "$ffmpeg/bin/ffmpeg" \
    && curl -fsSLO "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/$ytdlp" \
    && curl -fsSLO "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/SHA2-256SUMS" \
    && grep " $ytdlp\$" SHA2-256SUMS | sha256sum -c - \
    && install -m 755 "$ytdlp" /opt/yt-dlp/yt-dlp \
    && cd / && rm -rf /tmp/tools \
    && apt-get purge -y curl xz-utils && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && command -v setpriv && ffmpeg -version | head -n 1 && /opt/yt-dlp/yt-dlp --version

COPY --from=deps /app/node_modules node_modules
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/mise-entrypoint
RUN mkdir -p /data

EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["mise-entrypoint"]
CMD ["node", "apps/server/src/index.ts"]
