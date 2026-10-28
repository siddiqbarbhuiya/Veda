import type { ChatMessage, ProviderAdapter, StreamChunk, TokenUsage } from './types';
import { readSSEData, throwProviderError } from './sse';

export const geminiAdapter: ProviderAdapter = {
  async *streamChat(apiKey: string, model: string, messages: ChatMessage[]): AsyncGenerator<StreamChunk> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const body: Record<string, unknown> = { contents };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
      `:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) await throwProviderError(res, 'Gemini');

    let usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
    for await (const data of readSSEData(res)) {
      let json;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const parts: { text?: string }[] = json?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? '').join('');
      if (text) yield { chunk: text, done: false };
      if (json?.usageMetadata) {
        usage = {
          input_tokens: json.usageMetadata.promptTokenCount ?? 0,
          output_tokens: json.usageMetadata.candidatesTokenCount ?? 0,
        };
      }
    }
    yield { chunk: '', done: true, usage };
  },
};
