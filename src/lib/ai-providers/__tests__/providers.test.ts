import { describe, it, expect, vi, afterEach } from 'vitest';
import { getProviderAdapter } from '../index';

function sse(lines: string[]): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const l of lines) c.enqueue(enc.encode(l));
        c.close();
      },
    })
  );
}
async function collect(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = [];
  for await (const x of gen) out.push(x);
  return out;
}
afterEach(() => vi.unstubAllGlobals());

describe('gemini adapter', () => {
  it('streams text and usage', async () => {
    const f = vi.fn().mockResolvedValue(
      sse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\r\n\r\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"!"}]}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\r\n\r\n',
      ])
    );
    vi.stubGlobal('fetch', f);
    const out = await collect(
      getProviderAdapter('gemini').streamChat('key', 'gemini-2.0-flash', [
        { role: 'system', content: 's' },
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'a' },
      ])
    );
    expect(out).toEqual([
      { chunk: 'Hi', done: false },
      { chunk: '!', done: false },
      { chunk: '', done: true, usage: { input_tokens: 3, output_tokens: 2 } },
    ]);
    expect(f.mock.calls[0][0]).toContain('gemini-2.0-flash:streamGenerateContent?key=key&alt=sse');
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model']);
    expect(body.systemInstruction.parts[0].text).toBe('s');
  });

  it('throws provider error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }))
    );
    await expect(collect(getProviderAdapter('gemini').streamChat('k', 'm', []))).rejects.toThrow('API key not valid');
  });
});

describe('anthropic adapter', () => {
  it('streams text and combines usage', async () => {
    const f = vi.fn().mockResolvedValue(
      sse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":1}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ])
    );
    vi.stubGlobal('fetch', f);
    const out = await collect(
      getProviderAdapter('anthropic').streamChat('k', 'claude-x', [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'q' },
      ])
    );
    expect(out).toEqual([
      { chunk: 'Yo', done: false },
      { chunk: '', done: true, usage: { input_tokens: 10, output_tokens: 7 } },
    ]);
    const body = JSON.parse(f.mock.calls[0][1].body);
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'q' }]);
    expect(f.mock.calls[0][1].headers['x-api-key']).toBe('k');
  });

  it('throws provider error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'error', error: { message: 'invalid x-api-key' } }), { status: 401 }))
    );
    await expect(collect(getProviderAdapter('anthropic').streamChat('k', 'm', []))).rejects.toThrow('invalid x-api-key');
  });
});

describe('getProviderAdapter', () => {
  it('throws on unknown provider', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getProviderAdapter('nope' as any)).toThrow('Unknown provider');
  });
});
