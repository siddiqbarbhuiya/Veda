import type { ChatMessage, ProviderAdapter, StreamChunk } from './types';
import { readSSEData, throwProviderError } from './sse';

const MAX_TOKENS = 4096;

export const anthropicAdapter: ProviderAdapter = {
  async *streamChat(apiKey: string, model: string, messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
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
    });
    if (!res.ok) await throwProviderError(res, 'Anthropic');

    let inputTokens = 0;
    let outputTokens = 0;
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
          inputTokens = json.message?.usage?.input_tokens ?? inputTokens;
          outputTokens = json.message?.usage?.output_tokens ?? outputTokens;
          break;
        case 'content_block_delta':
          if (typeof json.delta?.text === 'string' && json.delta.text) {
            yield { chunk: json.delta.text, done: false };
          }
          break;
        case 'message_delta':
          outputTokens = json.usage?.output_tokens ?? outputTokens;
          if (json.usage?.input_tokens != null) inputTokens = json.usage.input_tokens;
          break;
        case 'error':
          throw new Error(json.error?.message ?? 'Anthropic stream error');
      }
    }
    yield {
      chunk: '',
      done: true,
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
  },
};
