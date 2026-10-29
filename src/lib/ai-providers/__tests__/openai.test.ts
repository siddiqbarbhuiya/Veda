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
    // No usage chunk arrived: usage must stay undefined (unknown), not 0/0.
    const last = out[out.length - 1] as { usage?: unknown };
    expect(last).toMatchObject({ chunk: '', done: true });
    expect(last.usage).toBeUndefined();
  });

  it('passes the abort signal to fetch and reports finish_reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const ac = new AbortController();
    const out = await collect(openaiAdapter.streamChat('k', 'm', [], ac.signal));
    expect(fetchMock.mock.calls[0][1].signal).toBe(ac.signal);
    expect(out[out.length - 1]).toMatchObject({ done: true, finish_reason: 'length' });
  });

  it('cancels the upstream reader on early exit', async () => {
    const cancel = vi.fn();
    const enc = new TextEncoder();
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n'));
      },
      cancel,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const gen = openaiAdapter.streamChat('k', 'm', []);
    await gen.next();
    await gen.return(undefined);
    expect(cancel).toHaveBeenCalled();
  });

  it('carries status and Retry-After on provider errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'slow' } }), { status: 429, headers: { 'retry-after': '7' } })
      )
    );
    await expect(collect(openaiAdapter.streamChat('k', 'm', []))).rejects.toMatchObject({
      status: 429,
      retryAfter: 7,
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
