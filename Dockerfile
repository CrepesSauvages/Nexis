# --- Dépendances de production uniquement ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Image finale ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY plugins ./plugins

# Les données persistent hors de l'image : monter un volume sur /app/data.
RUN mkdir -p /app/data && chown -R node:node /app

USER node
VOLUME /app/data

CMD ["node", "src/index.js"]
