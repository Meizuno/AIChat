FROM node:22-alpine AS builder

WORKDIR /app

# Use the pnpm version pinned in `packageManager` so the image install matches
# what produced the lockfile locally / in CI. `corepack enable` makes `pnpm`
# resolve to the packageManager version when run inside the project.
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
# prisma schema must be present before install — the postinstall runs
# `prisma generate`, which reads prisma/schema.prisma.
COPY prisma ./prisma
# `prisma generate` needs a URL present (not reachable) to parse the datasource.
ENV NUXT_DATABASE_URL="postgresql://x:x@x:5432/x"
# Limit the Prisma CLI / engines to the alpine (musl) target so the image
# doesn't ship binaries for darwin / linux-glibc / etc.
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x"
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PRISMA_CLI_BINARY_TARGETS="linux-musl-openssl-3.0.x"

# .output/server is a self-contained Nitro bundle with its own minimal
# node_modules (including @prisma/client + the native engine binary). We do
# NOT copy the top-level node_modules — most of it is already inlined.
COPY --from=builder /app/.output ./.output
# schema + migrations are needed by `prisma migrate deploy` on startup.
COPY --from=builder /app/prisma ./prisma
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Install the prisma CLI globally — one package, single platform's engines,
# used only for `prisma migrate deploy` on container start. Pin the major to
# match the @prisma/client baked into .output.
RUN npm install -g prisma@6 \
 && npm cache clean --force

EXPOSE 3000

# Container readiness probe — orchestrators (Docker, Compose, Swarm, k8s) wait
# for `healthy` before routing traffic.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
