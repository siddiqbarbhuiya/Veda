import type { ChatMessage, ProviderAdapter, StreamChunk, TokenUsage } from './types';
import { readSSEData, throwProviderError } from './sse';

const MAX_TOKENS = 4096;

type AnthropicUsage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

// Cache tokens are billed as input.
function inputOf(u: AnthropicUsage | undefined, fallback: number): number {
  if (u?.input_tokens == null) return fallback;
  return u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
}

export const anthropicAdapter: ProviderAdapter = {
  async *streamChat(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const body: Record<string, unknown> = {
      model,
      max_tokens: MAX_TOKENS,
      stream: true,
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
    };
    if (system) body.system = system;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) await throwProviderError(res, 'Anthropic');

    let inputTokens = 0;
    let outputTokens = 0;
    let gotFinalUsage = false;
    let finishReason: string | undefined;
    for await (const data of readSSEData(res)) {
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      if (json?.type === 'message_stop') break;
      switch (json?.type) {
        case 'message_start':
          inputTokens = inputOf(json.message?.usage, inputTokens);
          outputTokens = json.message?.usage?.output_tokens ?? outputTokens;
          break;
        case 'content_block_delta':
          if (typeof json.delta?.text === 'string' && json.delta.text) {
            yield { chunk: json.delta.text, done: false };
          }
          break;
        case 'message_delta':
          outputTokens = json.usage?.output_tokens ?? outputTokens;
          inputTokens = inputOf(json.usage, inputTokens);
          if (typeof json.delta?.stop_reason === 'string') finishReason = json.delta.stop_reason;
          gotFinalUsage = true;
          break;
        case 'error':
          throw new Error(json.error?.message ?? 'Anthropic stream error');
      }
    }
    // usage stays undefined unless the closing message_delta arrived with real counts.
    const usage: TokenUsage | undefined = gotFinalUsage
      ? { input_tokens: inputTokens, output_tokens: outputTokens }
      : undefined;
    yield { chunk: '', done: true, usage, finish_reason: finishReason };
  },
};
