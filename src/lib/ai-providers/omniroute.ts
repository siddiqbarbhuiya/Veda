import type { ChatMessage, ProviderAdapter, StreamChunk, TokenUsage } from './types';
import { ProviderError, readSSEData, throwProviderError } from './sse';
import { decodeConfig, omniFetch, omniHeaders } from '@/lib/omniroute/config';

/**
 * The student's own OmniRoute. The stored "key" is JSON with the address and the OmniRoute key.
 * The model is a combo name or a model id from that OmniRoute. OmniRoute speaks the OpenAI chat format.
 */
export const omnirouteAdapter: ProviderAdapter = {
  async *streamChat(
    storedKey: string,
    model: string,
    messages: ChatMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const cfg = decodeConfig(storedKey);
    if (!cfg) throw new ProviderError('The saved OmniRoute address is not valid. Save it again in your dashboard.', 400);
    let res: Response;
    try {
      res = await omniFetch(cfg, '/v1/chat/completions', {
        method: 'POST',
        headers: omniHeaders(cfg),
        body: JSON.stringify({ model, messages, stream: true, stream_options: { include_usage: true } }),
        signal,
        timeoutMs: null,
      });
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err;
      throw new ProviderError('Could not reach your OmniRoute. Check that it is running and public.', 502);
    }
    // A redirect is never followed: it would be the way to a private address.
    if (res.status >= 300 && res.status < 400) throw new ProviderError('Your OmniRoute answered with a redirect. Use its final address.', 502);
    if (!res.ok) await throwProviderError(res, 'OmniRoute');

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
      if (json?.error) {
        const code = Number(json.error.code);
        throw new ProviderError(
          typeof json.error.message === 'string' ? json.error.message : 'OmniRoute stream error',
          Number.isFinite(code) && code >= 400 ? code : 502
        );
      }
      const text = json?.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text) yield { chunk: text, done: false };
      const reason = json?.choices?.[0]?.finish_reason;
      if (typeof reason === 'string' && reason) finishReason = reason;
      if (json?.usage) {
        usage = { input_tokens: json.usage.prompt_tokens ?? 0, output_tokens: json.usage.completion_tokens ?? 0 };
      }
    }
    yield { chunk: '', done: true, usage, finish_reason: finishReason };
  },
};
