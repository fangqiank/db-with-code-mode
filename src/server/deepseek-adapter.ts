import { BaseTextAdapter } from '@tanstack/ai/adapters'
import type { StreamChunk, TextOptions } from '@tanstack/ai'

/**
 * DeepSeek text adapter using Chat Completions API via fetch.
 * Handles DeepSeek V4 thinking mode (reasoning_content).
 */
export class DeepSeekTextAdapter extends BaseTextAdapter<
  string,
  Record<string, any>,
  readonly ('text')[],
  any
> {
  readonly kind = 'text' as const
  readonly name = 'deepseek'
  readonly model: string
  readonly '~types' = {
    providerOptions: {} as Record<string, any>,
    inputModalities: ['text'] as readonly ('text')[],
    messageMetadataByModality: {} as any,
  }
  private apiKey: string
  private baseURL: string
  // Cache reasoning content from the last response — DeepSeek V4 requires
  // it to be passed back in subsequent calls, but TanStack AI doesn't store it.
  private lastReasoningContent: string | null = null

  constructor(
    config: { apiKey: string; baseURL?: string },
    model: string,
  ) {
    super(undefined, model)
    this.model = model
    this.apiKey = config.apiKey
    this.baseURL = (config.baseURL || 'https://api.deepseek.com').replace(
      /\/+$/,
      '',
    )
  }

  async *chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    const runId = this.generateId()
    const messageId = this.generateId()

    const messages = this.buildMessages(options)
    const tools = buildTools(options)

    const body: Record<string, unknown> = {
      model: options.model,
      messages,
      stream: true,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
    }
    if (tools) body.tools = tools

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.abortController?.signal,
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[DeepSeek] API error body: ${text.slice(0, 1000)}`)
      throw new Error(
        `DeepSeek API error ${response.status}: ${text.slice(0, 500)}`,
      )
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    let accumulatedContent = ''
    let accumulatedReasoning = ''
    let hasEmittedRunStarted = false
    let hasEmittedTextStart = false
    let hasEmittedTextEnd = false
    let hasEmittedStepStarted = false
    let stepId: string | null = null

    const toolCalls = new Map<
      number,
      { id: string; name: string; args: string; started: boolean }
    >()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          let chunk: any
          try {
            chunk = JSON.parse(data)
          } catch {
            continue
          }

          if (!hasEmittedRunStarted) {
            hasEmittedRunStarted = true
            yield {
              type: 'RUN_STARTED',
              runId,
              model: options.model,
              timestamp,
            } as StreamChunk
          }

          const choice = chunk.choices?.[0]
          if (!choice) continue

          // Reasoning content (DeepSeek V4 thinking mode)
          const reasoningDelta = choice.delta?.reasoning_content
          if (reasoningDelta) {
            if (!hasEmittedStepStarted) {
              hasEmittedStepStarted = true
              stepId = this.generateId()
              yield {
                type: 'STEP_STARTED',
                stepId,
                model: options.model,
                timestamp,
                stepType: 'thinking',
              } as StreamChunk
            }
            accumulatedReasoning += reasoningDelta
            yield {
              type: 'STEP_FINISHED',
              stepId: stepId || this.generateId(),
              model: options.model,
              timestamp,
              delta: reasoningDelta,
              content: accumulatedReasoning,
            } as StreamChunk
          }

          // Text content
          const textDelta = choice.delta?.content
          if (textDelta) {
            if (!hasEmittedTextStart) {
              hasEmittedTextStart = true
              yield {
                type: 'TEXT_MESSAGE_START',
                messageId,
                model: options.model,
                timestamp,
                role: 'assistant',
              } as StreamChunk
            }
            accumulatedContent += textDelta
            yield {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              model: options.model,
              timestamp,
              delta: textDelta,
              content: accumulatedContent,
            } as StreamChunk
          }

          // Tool call deltas
          const toolCallDeltas = choice.delta?.tool_calls
          if (toolCallDeltas) {
            for (const tc of toolCallDeltas as Array<{
              index: number
              id?: string
              function?: { name?: string; arguments?: string }
            }>) {
              const idx = tc.index
              if (!toolCalls.has(idx)) {
                toolCalls.set(idx, {
                  id: tc.id || this.generateId(),
                  name: tc.function?.name || '',
                  args: '',
                  started: false,
                })
              }

              const entry = toolCalls.get(idx)!

              if (!entry.started) {
                entry.started = true
                entry.id = tc.id || entry.id
                entry.name = tc.function?.name || entry.name
                yield {
                  type: 'TOOL_CALL_START',
                  toolCallId: entry.id,
                  toolName: entry.name,
                  model: options.model,
                  timestamp,
                } as StreamChunk
              }

              if (tc.function?.arguments) {
                entry.args += tc.function.arguments
                yield {
                  type: 'TOOL_CALL_ARGS',
                  toolCallId: entry.id,
                  model: options.model,
                  timestamp,
                  delta: tc.function.arguments,
                  args: entry.args,
                } as StreamChunk
              }
            }
          }

          // Finish
          if (choice.finish_reason) {
            if (hasEmittedTextStart && !hasEmittedTextEnd) {
              hasEmittedTextEnd = true
              yield {
                type: 'TEXT_MESSAGE_END',
                messageId,
                model: options.model,
                timestamp,
              } as StreamChunk
            }

            for (const [, entry] of toolCalls) {
              yield {
                type: 'TOOL_CALL_END',
                toolCallId: entry.id,
                toolName: entry.name,
                model: options.model,
                timestamp,
                input: JSON.parse(entry.args || '{}'),
              } as StreamChunk
            }

            yield {
              type: 'RUN_FINISHED',
              runId,
              model: options.model,
              timestamp,
              finishReason:
                choice.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop',
            } as StreamChunk
          }
        }
      }
    } finally {
      reader.releaseLock()
      // Cache reasoning for the next call in this conversation
      this.lastReasoningContent = accumulatedReasoning || null
    }

    // Stream ended — emit any missing closing events
    if (hasEmittedRunStarted) {
      if (hasEmittedTextStart && !hasEmittedTextEnd) {
        hasEmittedTextEnd = true
        yield {
          type: 'TEXT_MESSAGE_END',
          messageId,
          model: options.model,
          timestamp,
        } as StreamChunk
      }

      for (const [, entry] of toolCalls) {
        yield {
          type: 'TOOL_CALL_END',
          toolCallId: entry.id,
          toolName: entry.name,
          model: options.model,
          timestamp,
          input: JSON.parse(entry.args || '{}'),
        } as StreamChunk
      }

      yield {
        type: 'RUN_FINISHED',
        runId,
        model: options.model,
        timestamp,
        finishReason: toolCalls.size > 0 ? 'tool_calls' : 'stop',
      } as StreamChunk
    }
  }

  async structuredOutput(_options: any): Promise<any> {
    throw new Error(
      'Structured output is not supported by the DeepSeek adapter',
    )
  }

  private buildMessages(options: TextOptions): ChatMessage[] {
    const messages: ChatMessage[] = []

    if (options.systemPrompts?.length) {
      messages.push({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    for (const msg of options.messages as Array<Record<string, any>>) {
      if (msg.role === 'user') {
        messages.push({ role: 'user', content: msg.content as string })
      } else if (msg.role === 'assistant') {
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: typeof msg.content === 'string' ? msg.content : null,
        }

        // DeepSeek V4 thinking mode: reasoning_content must be passed back
        const reasoning =
          msg.reasoningContent ||
          msg.reasoning_content ||
          msg.reasoning ||
          null
        if (typeof reasoning === 'string' && reasoning.length > 0) {
          assistantMsg.reasoning_content = reasoning
        } else if (msg.toolCalls?.length && this.lastReasoningContent) {
          // TanStack AI doesn't persist reasoning in the message object.
          // Inject cached reasoning for assistant messages with tool calls.
          assistantMsg.reasoning_content = this.lastReasoningContent
        }

        if (msg.toolCalls?.length) {
          assistantMsg.tool_calls = msg.toolCalls.map((tc: any) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments:
                typeof tc.function.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments),
            },
          }))
        }
        messages.push(assistantMsg)
      } else if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId || '',
          content:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
        })
      }
    }

    return messages
  }
}

// --- helpers ---

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  reasoning_content?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

function buildTools(
  options: TextOptions,
):
  | Array<{
      type: 'function'
      function: {
        name: string
        description: string
        parameters?: Record<string, any>
      }
    }>
  | undefined {
  if (!options.tools?.length) return undefined
  return options.tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
        ? schemaToJSON(tool.inputSchema)
        : undefined,
    },
  }))
}

function schemaToJSON(schema: any): Record<string, any> | undefined {
  if (!schema) return undefined
  if (typeof schema['~standard']?.jsonSchema?.input === 'function') {
    return schema['~standard'].jsonSchema.input({ target: 'draft-2020-12' })
  }
  if (schema.type || schema.properties) return schema
  return undefined
}
