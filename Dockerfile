# Dockerfile otimizado para Deploy rápido no Coolify / Hetzner Cloud (Node 20 + MuseScore 3 Headless)

# 1. Instalar dependências Node.js em imagem leve
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --omit=optional

# 2. Build da aplicação Next.js (com limite seguro de RAM para VPS 4GB)
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN npm run build

# 3. Imagem final de produção com MuseScore 3 + Fontconfig + Xvfb
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fontconfig \
    musescore3 \
    xvfb \
    xauth \
    fonts-freefont-ttf \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    mkdir -p /tmp/runtime-rubsax /tmp/fontconfig-cache /tmp/musescore-home && \
    chmod -R 777 /tmp/runtime-rubsax /tmp/fontconfig-cache /tmp/musescore-home && \
    chown -R nextjs:nodejs /tmp/runtime-rubsax /tmp/fontconfig-cache /tmp/musescore-home && \
    fc-cache -f -v

ENV HOME=/tmp/musescore-home
ENV XDG_RUNTIME_DIR=/tmp/runtime-rubsax
ENV XDG_CACHE_HOME=/tmp/fontconfig-cache
ENV QT_QPA_PLATFORM=offscreen
ENV MUSESCORE_BIN_PATH="mscore3"

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]
