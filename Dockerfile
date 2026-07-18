# Intellisper OAuth Broker — tiny, stateless, credential-holding service.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Install production deps only.
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Run as a non-root user — a secret-holding service should never run as root.
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
