import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, tool, jsonSchema, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { requireAuthUser, getAccessTokenFromRequest } from '../utils/auth'

const MCP_URL = 'http://localhost:3001/api/mcp'

async function getMcpTools(client: Client) {
  const { tools: mcpTools } = await client.listTools()

  return Object.fromEntries(mcpTools.map((t) => {
    const raw = t.inputSchema as Record<string, unknown>
    console.log(`[MCP] tool=${t.name} inputSchema=`, JSON.stringify(raw))

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { $schema, additionalProperties, ...rest } = raw as Record<string, unknown>

    const normalized: Record<string, unknown> = {
      ...rest,
      type: 'object',
      properties: (rest?.properties as Record<string, unknown>) ?? {},
      required: (rest?.required as string[]) ?? []
    }

    const schema = jsonSchema(normalized)

    return [
      t.name,
      tool({
        description: t.description ?? '',
        inputSchema: schema,
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
  const token = getAccessTokenFromRequest(event)

  let mcpClient: Client | null = null
  let tools = {}

  try {
    mcpClient = new Client({ name: 'ai-chat', version: '1.0.0' })
    await mcpClient.connect(new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    }))
    tools = await getMcpTools(mcpClient)
    console.log('[MCP] Connected, tools:', Object.keys(tools))
  }
  catch (err) {
    console.warn('[MCP] Could not connect, proceeding without tools:', (err as Error).message)
    mcpClient = null
  }

  const result = streamText({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant. Use available tools when user asks for account, transaction, spending, income, or summary data.',
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
        await mcpClient?.close()
      }
    })
  })
})
