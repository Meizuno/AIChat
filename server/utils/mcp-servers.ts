import type { CreateMcpServerInput, UpdateMcpServerInput } from '#shared/schemas/mcp-servers'

// Scoped data-access for the user's own MCP servers. Every query filters by the
// SSO `userId` (a user only ever touches their own). Mirrors chats.ts — thin
// Prisma, typed domain errors elsewhere, no HTTP concerns here.

/** A resolved MCP connection the chat/probe paths iterate: url + whether to auth. */
export type McpTarget = { name: string, url: string, useAuth: boolean }

function deriveName(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** All of a user's own MCP servers (enabled + disabled), for the settings list. */
export function listUserMcpServers(userId: string) {
  return getPrisma().mcpServer.findMany({
    where: { user_id: userId },
    orderBy: { createdAt: 'asc' }
  })
}

/** Register a new MCP server for a user (name defaults to the URL host). */
export function createUserMcpServer(userId: string, input: CreateMcpServerInput) {
  return getPrisma().mcpServer.create({
    data: {
      user_id: userId,
      name: input.name?.trim() || deriveName(input.url),
      url: input.url,
      useAuth: input.useAuth
    }
  })
}

/** Patch a user's MCP server (scoped). Returns the update count (0 = not theirs). */
export async function updateUserMcpServer(userId: string, id: string, patch: UpdateMcpServerInput) {
  const { count } = await getPrisma().mcpServer.updateMany({
    where: { id, user_id: userId },
    data: patch
  })
  return count
}

/** Delete a user's MCP server (scoped). Returns the delete count. */
export async function deleteUserMcpServer(userId: string, id: string) {
  const { count } = await getPrisma().mcpServer.deleteMany({
    where: { id, user_id: userId }
  })
  return count
}

/**
 * The effective MCP targets for a user: their own enabled servers. Each sends
 * the SSO access token as a Bearer only when `useAuth` is checked. There are no
 * built-in/shared servers — every server is user-registered.
 */
export async function getEffectiveMcpTargets(userId: string): Promise<McpTarget[]> {
  return (await listUserMcpServers(userId))
    .filter(s => s.enabled)
    .map(s => ({ name: s.name, url: s.url, useAuth: s.useAuth }))
}
