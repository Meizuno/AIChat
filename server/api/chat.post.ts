import { streamText, convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, tool, jsonSchema, stepCountIs, isTextUIPart } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { requireAuthUser } from '../utils/auth'
import { getMcpServers } from '../utils/mcp-config'

const PRICE_INPUT = 2.50
const PRICE_OUTPUT = 10.00

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
  const user = await requireAuthUser(event)

  const { messages, conversationId: incomingConversationId, temporary } = await readBody(event)
  const { openaiApiKey } = useRuntimeConfig(event)
  const openai = createOpenAI({ apiKey: openaiApiKey })
  const mcpToken = event.context.accessToken as string | undefined

  // Find or create conversation (skip for temporary chats)
  let conversationId: string = incomingConversationId
  if (!temporary) {
    if (!conversationId) {
      const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user')
      const firstText = lastUserMessage?.parts?.find(isTextUIPart)?.text ?? 'New conversation'
      const conversation = await getPrisma().conversation.create({
        data: { userId: user.id, title: firstText.slice(0, 60) }
      })
      conversationId = conversation.id
    }

    const lastUserMessage = [...messages].reverse().find((m: { role: string, id: string }) => m.role === 'user')
    if (lastUserMessage) {
      const text = lastUserMessage.parts?.find(isTextUIPart)?.text ?? ''
      await getPrisma().message.upsert({
        where: { id: lastUserMessage.id },
        update: {},
        create: { id: lastUserMessage.id, conversationId, role: 'user', content: text }
      })
    }
  }

  const mcpClients: Client[] = []
  let tools = {}

  for (const server of getMcpServers()) {
    try {
      const client = new Client({ name: 'ai-chat', version: '1.0.0' })
      await client.connect(new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: { headers: { authorization: `Bearer ${mcpToken}` } }
      }))
      tools = { ...tools, ...await getMcpTools(client) }
      mcpClients.push(client)
    }
    catch (err) {
      console.warn(`[MCP] Could not connect to ${server.name}, skipping:`, (err as Error).message)
    }
  }

  const result = streamText({
    model: openai('gpt-5.4-nano'),
    system: `You are a financial assistant with access to the user's money manager data via tools.
Rules:
- ONLY answer questions using data retrieved from the available tools.
- Always call the relevant tool before answering any question about accounts, transactions, budgets, spending, income, or summaries.
- If no tool is relevant or the tool returns no data, respond with: "I don't have that information."
- Do NOT use general knowledge to answer financial questions — only tool results.
- For non-financial questions (greetings, how-to, general chat), you may answer normally.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5)
  })

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      async execute({ writer }) {
        writer.write({ type: 'data-conversationId', data: conversationId } as never)
        writer.merge(result.toUIMessageStream())

        const [usage, response] = await Promise.all([result.usage, result.response])

        if (!temporary && conversationId) {
          const assistantText = response.messages
            .filter(m => m.role === 'assistant')
            .flatMap((m) => {
              if (!Array.isArray(m.content)) return []
              return m.content
                .filter((c): c is { type: 'text', text: string } => typeof c === 'object' && c !== null && 'type' in c && (c as { type: string }).type === 'text')
                .map(c => c.text)
            })
            .join('\n\n')

          const messageId = response.id ?? crypto.randomUUID()
          await getPrisma().message.create({
            data: { id: messageId, conversationId, role: 'assistant', content: assistantText }
          })

          const costUsd = ((usage.inputTokens ?? 0) / 1_000_000) * PRICE_INPUT
            + ((usage.outputTokens ?? 0) / 1_000_000) * PRICE_OUTPUT

          await getPrisma().conversation.update({
            where: { id: conversationId },
            data: {
              inputTokens: { increment: usage.inputTokens ?? 0 },
              outputTokens: { increment: usage.outputTokens ?? 0 },
              costUsd: { increment: costUsd }
            }
          })
        }

        writer.write({ type: 'data-usage', data: usage } as never)
        await Promise.all(mcpClients.map(c => c.close()))
      }
    })
  })
})
