import { describe, it, expect, vi, afterEach } from 'vitest';
import { openaiAdapter } from '../openai';

function sseResponse(lines: string[], status = 200): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l));
      c.close();
    },
  });
  return new Response(stream, { status });
}

async function collect(gen: AsyncGenerator<unknown>) {
  const out: unknown[] = [];
  for await (const x of gen) out.push(x);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe('openaiAdapter', () => {
  it('yields content chunks then a final usage chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await collect(
      openaiAdapter.streamChat('sk-x', 'gpt-4o', [{ role: 'user', content: 'hi' }])
    );
    expect(out).toEqual([
      { chunk: 'Hel', done: false },
      { chunk: 'lo', done: false },
      { chunk: '', done: true, usage: { input_tokens: 5, output_tokens: 2 } },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('handles SSE lines split across network chunks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"con',
          'tent":"A"}}]}\n\ndata: [DONE]\n\n',
        ])
      )
    );
    const out = await collect(openaiAdapter.streamChat('k', 'm', []));
    expect(out[0]).toEqual({ chunk: 'A', done: false });
    expect(out[out.length - 1]).toEqual({
      chunk: '',
      done: true,
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  });

  it('throws the provider error message on non-200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Bad key' } }), { status: 401 })
      )
    );
    await expect(collect(openaiAdapter.streamChat('k', 'm', []))).rejects.toThrow('Bad key');
  });
});
