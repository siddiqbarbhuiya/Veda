import type { ChatMessage, ProviderAdapter, StreamChunk, TokenUsage } from './types';
import { ProviderError, readSSEData, throwProviderError } from './sse';

// OpenRouter speaks the OpenAI chat format. Model ids look like "vendor/name" or "vendor/name:free".
export const openrouterAdapter: ProviderAdapter = {
  async *streamChat(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://veda.app',
        'X-Title': 'Veda',
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        usage: { include: true },
      }),
      signal,
    });
    if (!res.ok) await throwProviderError(res, 'OpenRouter');

    let usage: TokenUsage | undefined;
    let finishReason: string | undefined;
    for await (const data of readSSEData(res)) {
      if (data === '[DONE]') break;
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      // A failure after the stream started arrives as an error object, not as an HTTP status.
      if (json?.error) {
        const code = Number(json.error.code);
        throw new ProviderError(
          typeof json.error.message === 'string' ? json.error.message : 'OpenRouter stream error',
          Number.isFinite(code) && code >= 400 ? code : 502
        );
      }
      const text = json?.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text) yield { chunk: text, done: false };
      const reason = json?.choices?.[0]?.finish_reason;
      if (typeof reason === 'string' && reason) finishReason = reason;
      if (json?.usage) {
        usage = {
          input_tokens: json.usage.prompt_tokens ?? 0,
          output_tokens: json.usage.completion_tokens ?? 0,
        };
      }
    }
    yield { chunk: '', done: true, usage, finish_reason: finishReason };
  },
};
