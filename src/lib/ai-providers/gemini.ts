import type { ChatMessage, ProviderAdapter, StreamChunk, TokenUsage } from './types';
import { readSSEData, throwProviderError } from './sse';

export const geminiAdapter: ProviderAdapter = {
  async *streamChat(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    const body: Record<string, unknown> = { contents };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    // The key goes in a header, not the URL, so it never reaches logs.
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}` +
      `:streamGenerateContent?alt=sse`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) await throwProviderError(res, 'Gemini');

    // usage stays undefined until the provider sends real counts.
    let usage: TokenUsage | undefined;
    let finishReason: string | undefined;
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
      const reason = json?.candidates?.[0]?.finishReason;
      if (typeof reason === 'string' && reason) finishReason = reason;
      if (json?.usageMetadata) {
        usage = {
          input_tokens: json.usageMetadata.promptTokenCount ?? 0,
          // Thinking tokens are billed as output.
          output_tokens:
            (json.usageMetadata.candidatesTokenCount ?? 0) + (json.usageMetadata.thoughtsTokenCount ?? 0),
        };
      }
    }
    yield { chunk: '', done: true, usage, finish_reason: finishReason };
  },
};
