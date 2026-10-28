import type { ChatMessage, ProviderAdapter, StreamChunk, TokenUsage } from './types';
import { readSSEData, throwProviderError } from './sse';

export const openaiAdapter: ProviderAdapter = {
  async *streamChat(apiKey: string, model: string, messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    if (!res.ok) await throwProviderError(res, 'OpenAI');

    let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
    for await (const data of readSSEData(res)) {
      if (data === '[DONE]') break;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const text = json?.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text) yield { chunk: text, done: false };
      if (json?.usage) {
        usage = {
          input_tokens: json.usage.prompt_tokens ?? 0,
          output_tokens: json.usage.completion_tokens ?? 0,
        };
      }
    }
    yield { chunk: '', done: true, usage };
  },
};
