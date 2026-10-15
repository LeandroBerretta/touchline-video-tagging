FROM node:24-bookworm-slim AS base
WORKDIR /workspace
COPY package*.json ./

FROM base AS development
RUN npm ci
COPY --chown=node:node . .
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /workspace/dist ./dist
COPY --from=build /workspace/public ./public
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
