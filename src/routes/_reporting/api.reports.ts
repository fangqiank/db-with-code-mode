import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  maxIterations,
  toServerSentEventsStream,
} from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import type { AnyTextAdapter } from '@tanstack/ai'

import { DeepSeekTextAdapter } from '#/server/deepseek-adapter'
import { databaseTools } from '#/lib/tools/database-tools'
import { reportTools } from '#/lib/reports/tools'
import { createReportBindings } from '#/lib/reports/create-report-bindings'

type Provider = 'anthropic' | 'openai' | 'gemini' | 'deepseek'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'deepseek':
      return new DeepSeekTextAdapter(
        {
          apiKey: process.env.DEEPSEEK_API_KEY || '',
          baseURL: 'https://api.deepseek.com',
        },
        model || 'deepseek-v4-flash',
      ) as unknown as AnyTextAdapter
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-haiku-4-5') as 'claude-haiku-4-5',
      )
  }
}

const DATABASE_SYSTEM_PROMPT = `You are a data analyst assistant. When the user asks for a report or data analysis, you MUST follow this exact workflow — do it in exactly 2 steps, no more:

**Step 1:** Call \`new_report\` with id and title.
**Step 2:** Call \`execute_typescript\` ONCE with ALL the code — fetch data AND build the report UI in the same code block. Do NOT split into multiple calls.

CRITICAL RULES:
1. Do NOT just query data and return it — you MUST call external_report_* functions to create visual components.
2. \`new_report\`, \`list_reports\`, \`delete_report\` are TOOL CALLS, NOT code. Call them as tools outside execute_typescript. NEVER use them inside execute_typescript code.
3. Inside execute_typescript, ONLY use functions that start with \`external_\` (external_queryTable, external_getSchemaInfo, external_report_*). No other functions exist inside the sandbox.
4. Keep code SHORT and SIMPLE. Minimize queries — fetch only what you need. Avoid unnecessary variables or verbose logic. Aim for under 4000 characters.

## Database Schema

- **customers** (35 rows) — id, name, email, city, joined
- **products** (20 rows) — id, name, category, price, stock
- **purchases** (550 rows) — id, customer_id, product_id, quantity, total, purchased_at
  - Date range: February 13 to April 13, 2026

## Functions available inside execute_typescript only

These are NOT tools. They can ONLY be used inside execute_typescript code:

- \`external_queryTable({ table, columns?, where?, orderBy?, limit? })\` — Query a table
- \`external_getSchemaInfo({ table? })\` — Get schema info
- \`external_report_*\` — All report component functions (card, chart, metric, text, etc.)`

const REPORTS_SYSTEM_PROMPT = `## Report Generation

You can create interactive reports that display data visualizations. Reports build incrementally — components appear as you add them in real-time.

### Creating a Report

1. Call \`new_report({ id: 'my-report', title: 'My Report Title' })\` — this opens the report in the UI
2. Use \`execute_typescript\` with \`external_report_*\` functions to add components
3. Components appear in real-time as you add them

### Report Component Functions

Inside \`execute_typescript\`, these functions add components to a report:

**Layout (containers for other components):**
- \`external_report_vbox({ reportId, id, parentId?, gap?, align?, padding? })\` — vertical stack
- \`external_report_hbox({ reportId, id, parentId?, gap?, align?, justify?, wrap? })\` — horizontal stack
- \`external_report_grid({ reportId, id, parentId?, cols?, gap? })\` — CSS grid
- \`external_report_card({ reportId, id, parentId?, title?, subtitle?, variant? })\` — card container
- \`external_report_section({ reportId, id, parentId?, title, collapsible? })\` — collapsible section

**Content (leaf components):**
- \`external_report_text({ reportId, id?, parentId?, content, variant?, color? })\` — text with variants (h1, h2, h3, body, caption, code). \`content\` supports inline markdown (\`**bold**\`, \`*italic*\`, \`\\\`code\\\`\`, \`[link](url)\`).
- \`external_report_metric({ reportId, id?, parentId?, value, label, trend?, format? })\` — big number display
- \`external_report_badge({ reportId, id?, parentId?, label, variant? })\` — status badge
- \`external_report_markdown({ reportId, id?, parentId?, content })\` — markdown content
- \`external_report_divider({ reportId, id?, parentId? })\` — horizontal divider
- \`external_report_spacer({ reportId, id?, parentId?, size? })\` — empty space

**Data (interactive components):**
- \`external_report_chart({ reportId, id, parentId?, type, data, xKey, yKey, ... })\` — charts (line, bar, area, pie, donut). **Always pass \`parentId\` pointing at a card** (see Best Practices below).
- \`external_report_sparkline({ reportId, id?, parentId?, data })\` — inline mini chart
- \`external_report_dataTable({ reportId, id, parentId?, columns, rows, ... })\` — sortable data table. **Wrap in a card too.**
- \`external_report_progress({ reportId, id?, parentId?, value, max?, label? })\` — progress bar
- \`external_report_timeline({ reportId, id, parentId?, items, layout?, variant? })\` — timeline of events. Each item has \`id\`, \`title\`, optional \`description\`, \`timestamp\`, and \`variant\` (one of: default, success, warning, error, info). Layout: vertical or horizontal.

**Operations:**
- \`external_report_update({ reportId, componentId, props })\` — update component props
- \`external_report_remove({ reportId, componentId })\` — remove a component
- \`external_report_reorder({ reportId, parentId, childIds })\` — reorder children

### Minimal Example

\`\`\`typescript
const reportId = 'sales-report'
const { rows: purchases } = await external_queryTable({ table: 'purchases' })
const total = purchases.reduce((s: number, p: any) => s + (p.total as number), 0)
external_report_card({ reportId, id: 'card1', title: 'Total Revenue' })
external_report_metric({ reportId, parentId: 'card1', value: total, label: 'Revenue', format: 'currency' })
return { total }
\`\`\`

### Best Practices

1. **Keep code SHORT** — under 4000 chars. Minimize DB queries.
2. **Wrap charts/tables in cards** — create card first, then add chart with \`parentId\`.
3. **Create containers first, then content**.
4. **Use parentId to nest** — components without parentId go to root.
5. **One report per topic.**
`

let codeModeCache: {
  tool: ReturnType<typeof createCodeMode>['tool']
  systemPrompt: string
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('#/lib/create-isolate-driver')
    // Use 'node' (isolated-vm) locally where native binary is available;
    // falls back to QuickJS automatically on platforms without the binary.
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeMode({
      driver,
      tools: databaseTools,
      timeout: 25000,
      memoryLimit: 128,
      getSkillBindings: async () => createReportBindings(),
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

export const Route = createFileRoute('/_reporting/api/reports')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model

        const adapter = getAdapter(provider, model)

        try {
          const { tool, systemPrompt } = await getCodeModeTools()

          const stream = chat({
            adapter,
            messages,
            tools: [tool, ...reportTools],
            systemPrompts: [
              DATABASE_SYSTEM_PROMPT,
              systemPrompt,
              REPORTS_SYSTEM_PROMPT,
            ],
            agentLoopStrategy: maxIterations(20),
            abortController,
            maxTokens: 8192,
          })

          const sseStream = toServerSentEventsStream(stream, abortController)

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[API Reports] Error:', error)

          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
