import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { PRICING } from '~/constants'

// Shared conversation state: the chat-history list, the active chat, and the
// live streaming Chat instance. A module singleton so the sidebar (in the
// layout) and the chat workspace (a page) share ONE source of truth — and so
// navigating to /servers and back preserves the in-flight chat rather than
// recreating it.
//
// SSR note: data is only fetched client-side (refreshChats runs from a
// component's onMounted, never during SSR render), so the shared module state
// carries no user data across SSR requests — the server renders an empty shell
// and the client hydrates it.

type ChatListItem = { id: string, title: string, updatedAt: string }

let store: ReturnType<typeof createStore> | null = null

function createStore() {
  const { usage, accumulate: accumulateUsage, estimatedCost } = useUsage(() => PRICING)
  // Captured here (setup context) so the streaming onData callback can raise it.
  const toast = useToast()

  const input = ref('')

  // The active conversation. Its id is sent with each request so the server
  // persists the turn. Switching chats means a fresh Chat instance (the id is
  // fixed at construction), so `chat` is a shallowRef we reassign.
  const activeChatId = ref<string>(crypto.randomUUID())

  function makeChat(id: string, messages: UIMessage[] = []) {
    return new Chat({
      id,
      messages,
      transport: new DefaultChatTransport(),
      onData(part) {
        if (part.type === 'data-usage') {
          accumulateUsage(part.data as { inputTokens?: number, outputTokens?: number, totalTokens?: number })
        } else if (part.type === 'data-notice') {
          const notice = part.data as { kind?: string, limit?: number }
          if (notice.kind === 'step-limit') {
            toast.add({
              title: 'Step limit reached',
              description: `Stopped after ${notice.limit} tool steps — ask me to continue.`,
              color: 'warning',
              icon: 'i-lucide-octagon-alert'
            })
          }
        }
      },
      onError(error) {
        console.error(error)
      }
    })
  }

  const chat = shallowRef(makeChat(activeChatId.value))

  // Mobile slideover open state — closed after picking/creating a chat.
  const sidebarOpen = ref(false)

  // Chat history list for the sidebar.
  const chats = ref<ChatListItem[]>([])
  const chatsLoaded = ref(false)
  async function refreshChats() {
    try {
      chats.value = await $fetch<ChatListItem[]>('/api/chats')
    } finally {
      chatsLoaded.value = true
    }
  }

  function newChat() {
    activeChatId.value = crypto.randomUUID()
    chat.value = makeChat(activeChatId.value)
    sidebarOpen.value = false
  }

  async function openChat(id: string) {
    sidebarOpen.value = false
    if (id === activeChatId.value) return
    const data = await $fetch<{ messages: Array<{ id: string, role: string, parts: unknown }> }>(`/api/chats/${id}`)
    const messages = data.messages.map(m => ({ id: m.id, role: m.role, parts: m.parts, metadata: undefined })) as UIMessage[]
    activeChatId.value = id
    chat.value = makeChat(id, messages)
  }

  async function deleteChatById(id: string) {
    await $fetch(`/api/chats/${id}`, { method: 'DELETE' })
    await refreshChats()
    if (id === activeChatId.value) newChat()
  }

  // Inline rename: clicking Rename swaps the title for an input.
  const editingId = ref<string | null>(null)
  const editingTitle = ref('')
  // When the dropdown closes it restores focus to its trigger, which blurs the
  // just-autofocused input. Ignore blur until this "armed" flag flips, so that
  // focus-restore blur doesn't submit before the user can type. Enter always
  // saves regardless.
  let renameArmed = false

  function startRename(c: ChatListItem) {
    editingId.value = c.id
    editingTitle.value = c.title
    renameArmed = false
    setTimeout(() => {
      renameArmed = true
    }, 250)
  }

  async function submitRename() {
    const id = editingId.value
    const title = editingTitle.value.trim()
    editingId.value = null
    if (!id || !title) return
    await $fetch(`/api/chats/${id}`, { method: 'PATCH', body: { title } })
    await refreshChats()
  }

  // Blur only saves once armed (skips the dropdown's focus-restore blur).
  function onRenameBlur() {
    if (renameArmed) submitRename()
  }

  // Per-chat ⋯ menu (works on touch, unlike a hover-only button).
  function chatMenu(c: ChatListItem) {
    return [[
      { label: 'Rename', icon: 'i-lucide-pencil', onSelect: () => startRename(c) },
      { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteChatById(c.id) }
    ]]
  }

  // The active chat as it appears in the list (undefined for a brand-new,
  // unsaved chat). Drives the page-header title + its rename/delete menu.
  const activeChat = computed(() => chats.value.find(c => c.id === activeChatId.value))
  const currentTitle = computed(() => activeChat.value?.title || 'New chat')
  const currentChatMenu = computed(() => (activeChat.value ? chatMenu(activeChat.value) : []))

  // After a turn completes the title/updatedAt change server-side — refresh the
  // sidebar list so a new chat's derived title and ordering show up.
  watch(() => chat.value.status, (status, prev) => {
    if (prev === 'streaming' && status === 'ready') refreshChats()
  })

  function onSubmit(files: import('ai').FileUIPart[] = []) {
    chat.value.sendMessage({ text: input.value, files })
    input.value = ''
    // UChatMessages pins the new user message to the top and reserves space
    // below it (via --last-message-height) until the response fills the screen.
  }

  return {
    input,
    activeChatId,
    chat,
    sidebarOpen,
    chats,
    chatsLoaded,
    refreshChats,
    newChat,
    openChat,
    deleteChatById,
    editingId,
    editingTitle,
    startRename,
    submitRename,
    onRenameBlur,
    chatMenu,
    activeChat,
    currentTitle,
    currentChatMenu,
    onSubmit,
    usage,
    estimatedCost
  }
}

export function useConversations() {
  if (!store) store = createStore()
  return store
}
