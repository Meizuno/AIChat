#!/bin/sh
set -e

# Apply any pending DB migrations before starting. `prisma` is installed
# globally in the Dockerfile (one platform's engines); the Nitro server bundle
# in .output/server has its own minimal node_modules with @prisma/client + the
# native engine binary for runtime queries.
prisma migrate deploy
exec node .output/server/index.mjs
