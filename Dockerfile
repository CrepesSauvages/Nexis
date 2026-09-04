# --- Dépendances de production uniquement ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts : cette étape ne fait que matérialiser node_modules. Le
# `prepare` racine (scripts/prepare.js) lance des hooks git et la
# construction du front, deux choses inutiles ici — et il échouerait de
# toute façon, `scripts/` n'étant pas copié dans cette étape.
RUN npm ci --omit=dev --ignore-scripts

# --- Construction de l'interface web ---
FROM node:22-alpine AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
# npm ci complet (devDependencies incluses) : il faut vite et tsc pour
# construire le front. --ignore-scripts pour ne pas relancer `prepare`.
RUN npm ci --ignore-scripts
COPY web ./web
RUN npm run build:web

# --- Image finale ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY plugins ./plugins
# L'interface est construite dans une étape dédiée : l'image finale récupère
# le résultat sans jamais embarquer la chaîne de construction du front.
COPY --from=web-build /app/web/dist ./web/dist

# Les données persistent hors de l'image : monter un volume sur /app/data.
RUN mkdir -p /app/data && chown -R node:node /app

USER node
VOLUME /app/data

CMD ["node", "src/index.js"]
