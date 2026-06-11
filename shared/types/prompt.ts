// Suggested-prompt entries advertised by /api/config. Each prompt is
// either a plain `prompt` string the user can send, or a `route` the
// client should fetch (renders a chart / list / structured block).
export type PromptItem = {
  label: string
  prompt?: string
  route?: string
}

// Prompts are grouped per MCP server so the picker can render
// section headings ("Money Manager", "Notes", …).
export type PromptGroup = {
  server: string
  prompts: PromptItem[]
}
