FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 ledgerwake && useradd --system --uid 10001 --gid ledgerwake --home-dir /app ledgerwake
COPY --from=build --chown=ledgerwake:ledgerwake /app/node_modules ./node_modules
COPY --from=build --chown=ledgerwake:ledgerwake /app/dist ./dist
COPY --chown=ledgerwake:ledgerwake package.json ./
COPY --chown=ledgerwake:ledgerwake migrations ./migrations
USER 10001:10001
EXPOSE 8787
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["serve", "--config", "/config/ledgerwake.json"]
