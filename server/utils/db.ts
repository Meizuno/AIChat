import { PrismaClient } from '@prisma/client'

// Prisma singleton. The connection string comes from runtimeConfig
// (NUXT_DATABASE_URL) — never read process.env here. Presence is guaranteed
// by the startup env validation (server/plugins/validate-env), so there's no
// per-request fallback/throw. Mirrors the notes / money-manager convention.
let prisma: PrismaClient | null = null

export const getPrisma = () => {
  if (!prisma) {
    prisma = new PrismaClient({ datasourceUrl: useRuntimeConfig().databaseUrl })
  }
  return prisma
}
