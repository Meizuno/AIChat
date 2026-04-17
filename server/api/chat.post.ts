import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, tool, jsonSchema, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { requireAuthUser } from '../utils/auth'
import { getMcpServers, getConfig } from '../utils/mcp-config'
import { createMcpClient } from '../utils/mcp-client'

async function getMcpTools(client: Client) {
  const { tools: mcpTools } = await client.listTools()

  return Object.fromEntries(mcpTools.map((t) => {
    const raw = t.inputSchema as Record<string, unknown>

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, additionalProperties, ...rest } = raw as Record<string, unknown>

    const normalized: Record<string, unknown> = {
      ...rest,
      type: 'object',
      properties: (rest?.properties as Record<string, unknown>) ?? {},
      required: (rest?.required as string[]) ?? []
    }

    return [
      t.name,
      tool({
        description: t.description ?? '',
        inputSchema: jsonSchema(normalized),
        execute: async (args) => {
          const result = await client.callTool({ name: t.name, arguments: (args ?? {}) as Record<string, unknown> })
          return result.content
        }
      })
    ]
  }))
}

export default defineEventHandler(async (event) => {
  await requireAuthUser(event)

  const { messages } = await readBody(event)
  const { openaiApiKey } = useRuntimeConfig(event)
  const openai = createOpenAI({ apiKey: openaiApiKey })

  let tools = {}

  for (const server of getMcpServers()) {
    try {
      const client = await createMcpClient(event, server.name)
      tools = { ...tools, ...await getMcpTools(client) }
    }
    catch (err) {
      console.warn(`[MCP] Could not connect to ${server.name}, skipping:`, (err as Error).message)
    }
  }

  const systemPrompt = getConfig().systemPrompt.replace('{date}', new Date().toISOString().slice(0, 10))

  const result = streamText({
    model: openai('gpt-5.4-nano'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5)
  })

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      async execute({ writer }) {
        writer.merge(result.toUIMessageStream())
        const usage = await result.usage
        writer.write({ type: 'data-usage', data: usage } as never)
        // Don't close — connections are pooled and reused
      }
    })
  })
})
