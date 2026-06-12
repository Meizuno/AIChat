FROM node:22-alpine AS builder

WORKDIR /app

# Use the pnpm version pinned in `packageManager` so the image
# install matches what produced the lockfile locally / in CI. The
# previous `npm install -g pnpm` floated to whatever latest was at
# build time, which produced a node_modules layout Nitro's tracer
# couldn't fully follow (vue/server-renderer went missing from the
# .output bundle and the container 500'd on every page render).
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/.output ./.output
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x entrypoint.sh

EXPOSE 3000

ENV NODE_ENV=production

# Container readiness probe — orchestrators (Docker, Compose, Swarm,
# k8s) wait for `healthy` before routing traffic.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
