# CLAUDE.md

Instructions for AI agents working in this repository. This is a **Nuxt 4 /
Nitro fullstack app** (Vue 3 + AI SDK + Model Context Protocol). The rules
below mirror the sibling [notes](https://github.com/Meizuno/Notes) and
[money-manager](https://github.com/Meizuno/MoneyManager) projects — same
architectural discipline, adapted to the fact that **ai-chat has no
database**. It is a chat shell that talks to OpenAI for completions, to MCP
servers for tool calls, and to an external auth service for sessions. No
records, no migrations, no Prisma.

---

## The one mental-model difference from a CRUD app

In notes / money-manager, the dominant pattern is:

```
HTTP handler → zod boundary → service → scoped data-access → Prisma
```

ai-chat has **no scoped data-access layer**, because there is no per-user
data to scope. The flow collapses to:

```
HTTP handler → zod boundary → service → external upstream (OpenAI / MCP / auth)
```

Everything that is shape-equivalent to the CRUD pattern (thin handlers, zod
at the boundary, business logic in `server/services/*`, typed domain errors,
fail-fast env validation, requestId logging, shared types in `#shared/`)
**is the same here**. What's missing — Prisma, migrations, a `Note`/
`Transaction` resource, a `viewerId(event)` filter — is missing because the
problem doesn't exist, not because the discipline relaxed.

---

## Quick orientation

Stack: **Nuxt 4** (Vue 3, `<script setup>`), **Nitro** server, **@ai-sdk/vue**
+ **@ai-sdk/openai** for streaming completions, **@modelcontextprotocol/sdk**
for tool servers, **@nuxt/ui 4**, **@nuxtjs/mdc** for Markdown, **zod** for
validation, **pnpm**. Auth is delegated to an **external auth service**
(`runtimeConfig.authServiceUrl`) — this repo validates/refreshes tokens, it
does not issue them.

```
app/                      ── CLIENT (Vue/Nuxt)
├── pages/                ── file-based routes (thin; orchestrate composables)
├── components/           ── presentation only (AppChat, ChatPrompt, Prose*)
├── composables/          ── CLIENT use-cases: useMcpStatus, useUsage,
│                            useAuth, usePullToRefresh
└── assets/

server/                   ── SERVER (Nitro)
├── api/                  ── thin HTTP handlers (parse → validate → service → return)
├── services/             ── SERVER use-cases: chat, mcp, config, prompts
├── utils/                ── auto-imported helpers (auth, errors, env, mcp-client, mcp-config)
├── middleware/           ── auth gate, request logging, prod page cache
├── plugins/              ── startup hooks (env validation)
└── types/                ── H3EventContext augmentation

shared/                   ── CROSS-CUTTING types + zod schemas (#shared)
├── schemas/              ── chat body + prompt query schemas
└── types/                ── auth/config/mcp/prompt wire shapes

config.yml                ── MCP server list + system prompt + defaults
test/                     ── vitest suites; tree mirrors source
.claude/skills/           ── /git-commit, /git-push, /git-sync, /verify
```

Before considering work done:

```sh
pnpm run typecheck      # nuxt typecheck (vue-tsc) — must be clean
pnpm run lint           # eslint (@nuxt/eslint) — must be clean
pnpm run test           # vitest — must pass
```

---

## Layering (the core discipline)

```
HTTP handler (server/api/*)         ── parse params/body, call service, return. NOTHING else.
   ↓
zod schema (#shared/schemas/*)       ── validate + type the input at the boundary
   ↓
service (server/services/*)          ── business logic = the "use case"
   ↓
external upstream                    ── OpenAI, MCP server, or auth service
```

**Handlers must be thin.** Target shape:

```ts
// server/api/chat.post.ts
import { chatBodySchema } from '#shared/schemas/chat'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, chatBodySchema.parse)
  return streamChatResponse(event, body)
})
```

```ts
// server/services/chat.ts
export async function streamChatResponse(event: H3Event, body: ChatBody) {
  await requireAuthUser(event)
  const { openaiApiKey } = useRuntimeConfig(event)
  const openai = createOpenAI({ apiKey: openaiApiKey })
  const tools = await getChatTools(event)
  // ... streamText + createUIMessageStreamResponse
}
```

A handler that contains an `if (!x)`, a raw `streamText(...)` call, or
ad-hoc `event.context.user` reads **is a refactor target.**

---

## Mandatory patterns

### 1. Validate at the boundary with zod

- Every request body / query is parsed through a **zod schema**, via
  `readValidatedBody(event, schema.parse)` or `getValidatedQuery(...)`.
- **No inline `if (!x)` validation.** Use `z.string().trim().min(1)`,
  `z.enum([...])`, `.default(...)`, etc.
- Define the schema once, **infer** the TS type from it
  (`type X = z.infer<typeof xSchema>`), and reuse that type on the client.
  Do not declare the same shape twice.
- Schemas shared by client and server live in **`shared/schemas/`** (`#shared`
  alias). Server-only schemas live with their service.
- For the `/api/chat` body specifically the schema is intentionally lax
  (`z.object({ messages: z.array(z.unknown()) })`): the message-part shape
  is AI-SDK-version-coupled and validated downstream by
  `convertToModelMessages`. Reimplementing its schema would rot in a week.

### 2. Service layer = the "use case" layer

- Business logic lives in `server/services/*`, auto-imported via
  `nitro.imports.dirs: ['server/services']` in `nuxt.config.ts`.
- A service is a **plain async function** taking the validated input (and
  `event` when it needs auth/context). No classes, no DI container.
- Services are **pure of HTTP**: they throw typed domain errors (see #4),
  never `createError({ statusCode })` directly.

### 3. No Repository / no data-access layer

- ai-chat owns no data. There is nothing to scope by user, no second
  backend to swap. The "external upstream" line in the layering diagram
  *is* the data layer — it's HTTP all the way down (OpenAI / MCP / auth).
- The MCP client pool (`server/utils/mcp-client.ts`) is the closest thing
  to a data-access abstraction; it just persists connections per
  `userId:serverUrl` so each chat tool call doesn't re-handshake. Don't
  build a Repository over it.

### 4. One error taxonomy (typed errors carry their own status)

- Domain errors live in `server/utils/errors.ts` as `H3Error` subclasses:
  `DomainError`, `Unauthorized`, `McpUnavailable`. Each carries its
  status + message in exactly **one place** — its class.

  ```ts
  export class Unauthorized extends DomainError {
    constructor(message?: string) { super(401, 'Unauthorized', message) }
  }
  ```
- **Why extend `H3Error`, not a Nitro plugin hook.** The Nitro `error`
  hook is observability-only — it cannot change the response. Nitro
  renders the status straight off `error.statusCode` and only treats an
  error as "handled" (vs an unhandled 500 with a masked message) when
  `isError()` is true, which keys off H3Error's static brand. So a typed
  H3Error subclass is the framework-native way to get a centrally-defined
  error that renders with the right status.
- **Validation errors are already 400.** `readValidatedBody` /
  `getValidatedQuery` wrap a thrown `ZodError` in a 400 at the boundary
  — no mapping needed.
- **Handlers never `try/except` business errors.** Let them bubble.

### 5. Fail-fast env validation

- Required env (`NUXT_OPENAI_API_KEY`, `NUXT_AUTH_SERVICE_URL`) is
  validated **once at startup** with a zod schema
  in a Nitro plugin (`server/plugins/validate-env.ts`), and the process
  **exits on failure** — not on the first request.
- This replaces "throw 500 on first use of a missing key" patterns.
- All config goes through `runtimeConfig` + `useRuntimeConfig()` — never
  read `process.env` directly in handlers/services (only the env plugin
  and `nuxt.config.ts` may).

### 6. Structured logging with request context

- Each request gets a `requestId` from `server/middleware/log.ts`, put on
  `event.context.requestId`, exposed as `x-request-id`, and emitted as
  one structured consola line on response finish.

### 7. Auth pattern (split between `authenticate` and `tryRefresh`)

- `authenticate(event)` is **pure validation** — read the access token
  (from header, cookie, or the SSR-dedup cache) and call `/validate`.
- `tryRefresh(event)` exchanges the refresh cookie for a fresh pair,
  populates the SSR-dedup cache (5-second TTL), and re-validates.
- `requireAuthUser(event)` chains: try `authenticate`, throw `Unauthorized`
  on failure.
- `server/middleware/auth.ts` calls `authenticate` then `tryRefresh` on
  failure for every non-allow-listed `/api/*` request. Downstream handlers
  just `await requireAuthUser(event)`.
- **The SSR-internal-fetch dedup cache** (`refreshedTokens`) is load-bearing
  for the `app.vue` flow that does `useFetch('/api/auth/me')` during SSR.
  Without it, the inner fetch re-POSTs `/refresh` with an already-rotated
  token and 401s. Document changes around it carefully.

---

## Frontend rules

### Composables = client-side use-cases

- Stateful logic lives in `app/composables/use*.ts`, **one responsibility
  per composable**. The current set:
  - `useAuth` — session + logout
  - `useMcpStatus` — MCP popover state + per-server status
  - `useUsage` — token cost accumulator + estimated cost
  - `usePullToRefresh` — touch-handler lifecycle on a container
- When a page or component accumulates `ref`s + `$fetch` + DOM listeners,
  **extract it into a composable**. The chat container did this in slice
  4 — it went from 526 lines to ~415 by pulling three composables out.

### Components are dumb

- Components render and emit. **No business logic, no scattered `$fetch`
  in components.** `AppChat.vue` reads from composables (`useAuth`,
  `useMcpStatus`, `useUsage`) and orchestrates layout — it does not own
  the underlying state.
- Multi-word component names — `AppChat.vue` not `chat.vue`.

### Data fetching discipline

- Use `useFetch` / `useAsyncData` for SSR-aware reads (always pass a stable
  `key`); use `$fetch` only for event-driven mutations (logout) or
  composable-driven polling (MCP status refresh).
- Don't fetch the same resource from both a page and a child component
  without sharing the `key`.

### Shared types, end-to-end

- The big TS win: **one type from the wire to the component.** Derive
  request/response types from zod schemas or hand-author wire shapes in
  `shared/types/*`, import them in both `server/` and `app/`. **Never**
  redeclare `type McpStatus = {...}` / `type PromptItem = ...` in a
  `.vue` file.

### Server-side vs client-side `AuthUser` (naming)

- `AuthUser` (in `server/utils/auth.ts`) is the request-scoped session
  identity, `{ id: string }`. Set on `event.context.user`.
- `ViewerProfile` (in `#shared/types/auth`) is the decorated profile —
  same id, plus avatar/name/email. Returned by `/api/auth/me`, used by
  `useAuth()`.
- They are **separate** by design — Nuxt auto-imports would collide if
  both were named `AuthUser`.

---

## Tests

**Vitest + @nuxt/test-utils** are wired up (`pnpm run test`).

- Runner: **Vitest** + **@nuxt/test-utils** (`vitest.config.ts` defaults to a
  node environment; opt into the Nuxt env per-file with `// @vitest-environment
  nuxt` for composable/component tests).
- **Schema tests:** zod schemas get a few "accepts / rejects / defaults"
  cases. Cheap, fast, run every commit.
- **Error taxonomy tests:** the H3Error brand check (`isError(new Unauthorized())`)
  is critical — if it ever returns false, Nitro will start rendering 500s
  for every typed error and the regression won't surface until prod.
- **Service tests** (when added): call the service function with a stub
  `event.context.user`; mock external HTTP via `$fetch` spies.
- A test tree that mirrors source (`test/server/services/*`,
  `test/shared/schemas/*`, `test/app/composables/*`) is the convention.

---

## File organization rules

- **One file per route**, method in the suffix. Handlers ≤ ~10 lines.
- **One service module per concern** (`server/services/{chat,mcp,config,
  prompts}.ts`), exporting one function per operation.
- **zod schemas**: shared ones in `shared/schemas/*`; server-only ones
  beside the service. Infer types from them; don't write parallel `type`
  aliases.
- **Shared helpers** in `server/utils/` (auto-imported).
- **Startup concerns** (env validation) in `server/plugins/`. The **domain
  error taxonomy** lives in `server/utils/errors.ts`, not a plugin.
- **One composable per concern** in `app/composables/`.

---

## Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server | `pnpm run dev` |
| Build | `pnpm run build` |
| Preview prod build | `pnpm run preview` |
| Typecheck | `pnpm run typecheck` (`nuxt typecheck`) |
| Lint | `pnpm run lint` (`eslint .`) |
| Test | `pnpm run test` (`vitest run`); watch: `pnpm run test:watch` |
| Full verify | `/verify` (skill — runs all three) |

---

## TypeScript standards

- **`<script setup lang="ts">`** for all components; explicit `defineProps`
  / `defineEmits` / `defineModel` generic types.
- **No `any`.** Use precise unions, `unknown` + narrowing, or inferred zod
  types. No `@ts-ignore` / `@ts-expect-error` to silence — fix the type;
  if an external-typing gap genuinely requires one (the `ChartLike`
  surface in `ProseChart` is a small justified example), leave an inline
  comment explaining why.
- **Infer, don't redeclare.** Prefer `z.infer` over hand-written duplicates
  of the same shape.
- **`async`/`await`** over raw promise chains in server code.
- **Code, identifiers, comments, commit messages — always English.**

---

## Verification checklist (before completing a task)

1. ✅ Touched handlers are **thin** — parse → validate → service → return.
2. ✅ Input is validated with a **zod schema**; the TS type is **inferred**
   from it, not redeclared.
3. ✅ Business logic lives in a **service function**, not the handler.
4. ✅ Services throw **typed domain errors**; no `try/except` in handlers;
   no `createError({ statusCode })` inside services.
5. ✅ No `process.env` reads outside the env plugin / `nuxt.config.ts`.
6. ✅ No duplicated wire types in `.vue` files — shared types imported
   from `#shared/types/*`.
7. ✅ New/changed client logic lives in a **composable**, not inline in a
   page or component.
8. ✅ `typecheck` / `lint` / `test` clean.

---

## What this project deliberately does NOT do

If tempted to add any of the following, **stop and confirm with the human
first**:

- ❌ **A database / Prisma / migrations.** ai-chat is stateless. If a
  feature needs persistence, it belongs in a different MCP-backed service
  (notes, money-manager, recipes-book) and ai-chat reaches it as a tool.
- ❌ **Repository pattern / ports & adapters.** There's no second
  backend to swap. The MCP client pool is already the right shape.
- ❌ **A DI container or composition root.** Nitro auto-imports and
  `event.context` are the DI mechanism. Don't hand-build wiring.
- ❌ **Hexagonal `domain/ application/ infrastructure/ presentation/`
  folders.** The layering here is `api → service → upstream` by file
  role, not by deep folder tree.
- ❌ **Building auth/JWT issuance.** Auth is delegated to the external
  service; this repo only validates/refreshes. Don't add token minting,
  password hashing, or a user table.
- ❌ **Bringing back audio transcription.** The Whisper sidecar
  integration was removed deliberately (PR #1). The chat is text-only
  by design; if voice input ever comes back it should be a separate
  service the chat consumes as a tool, not an inline endpoint.
- ❌ **Class-based services / use-case classes.** Plain functions are
  the idiom.
- ❌ **Global mutable module state** beyond the documented MCP client
  pool (`server/utils/mcp-client.ts`) and the SSR-refresh dedup cache
  (`server/utils/auth.ts`).

**The lesson:** a pattern earns its place by solving present pain, not
by appearing in a textbook.

---

## When in doubt

1. Match the Nuxt convention before inventing structure — the framework
   usually already has a place for it (`utils`, `composables`, `plugins`,
   `shared`, `middleware`).
2. Read an existing good example in the same area (`useMcpStatus`,
   `server/services/chat.ts`, `shared/schemas/prompt.ts`) and mirror its
   shape.
3. Ask before introducing any abstraction from the "deliberately does NOT
   do" list.
