# syntax=docker/dockerfile:1

# ── Stage 1 : build ─────────────────────────────────────────────────────────
FROM node:22-slim AS build
WORKDIR /app

# Prisma a besoin d'openssl
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Stage 2 : runtime ───────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=build /app/dist ./dist
COPY scripts ./scripts

# Le bot tourne en utilisateur NON-root (image node fournit l'utilisateur `node`).
# On prepare le dossier de stockage et on donne la propriete a `node` AVANT la
# creation du volume : un volume nomme vierge herite de cette propriete a sa
# premiere creation, donc `node` peut y ecrire les preuves.
RUN mkdir -p /app/storage && chown -R node:node /app
USER node

# Healthcheck : le process ecrit un battement de coeur ; on echoue s'il est perime
# (bot zombie / Gateway perdue) pour que Docker redemarre le conteneur.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "scripts/healthcheck.mjs"]

# Le bot est un processus permanent (cf. CDC §8.5), pas une tache planifiee.
CMD ["node", "dist/index.js"]
