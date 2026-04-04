import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

export type McpServerConfig = { name: string, url: string }

export type AppConfig = {
  mcpServers: McpServerConfig[]
  systemPrompt: string
  defaults: {
    currency: string
    transactionType: string
    language: string
    botName: string
    welcomeMessage: string
  }
  suggestedPrompts: { label: string, prompt?: string, route?: string }[]
}

export function getConfig(): AppConfig {
  const filePath = resolve(process.cwd(), 'config.yml')
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return load(raw) as AppConfig
  }
  catch {
    return {
      mcpServers: [],
      systemPrompt: 'You are a helpful financial assistant.',
      suggestedPrompts: [],
      defaults: { currency: 'CZK', transactionType: 'expense', language: 'en', botName: '', welcomeMessage: '' }
    }
  }
}

export function getMcpServers(): McpServerConfig[] {
  return getConfig().mcpServers ?? []
}
