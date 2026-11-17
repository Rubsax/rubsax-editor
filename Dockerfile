# Dockerfile para Deploy no Coolify / Hetzner Cloud (Ubuntu/Debian + Node 20 + MuseScore 3 Headless)
FROM node:20-bookworm-slim AS base

# 1. Instalar dependências de sistema + MuseScore 3 + Xvfb (para renderização headless de PDF/SVG) + fontes
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    musescore3 \
    xvfb \
    xauth \
    fonts-freefont-ttf \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Instalar dependências Node.js
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# 3. Build da aplicação Next.js
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 4. Imagem final de produção
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# No Debian/Ubuntu, o pacote musescore3 instala o binário "mscore3" (ou "musescore3")
ENV MUSESCORE_BIN_PATH="mscore3"
ENV MUSESCORE_USE_XVFB="1"

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]
