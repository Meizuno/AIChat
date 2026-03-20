import prismaPkg from '@prisma/client'

const { PrismaClient } = prismaPkg

let client: InstanceType<typeof PrismaClient> | null = null

export const getPrisma = () => {
  if (!client) client = new PrismaClient()
  return client
}
