# Image de l'API Express (Node.js 22 LTS)
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Dépendances d'abord : couche mise en cache tant que package*.json ne change pas
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY openapi.yaml ./

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
