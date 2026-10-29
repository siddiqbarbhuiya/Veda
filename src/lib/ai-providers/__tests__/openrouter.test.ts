import { describe, it, expect, vi, afterEach } from 'vitest';
import { openrouterAdapter } from '../openrouter';
import { ProviderError } from '../sse';

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

describe('openrouterAdapter', () => {
  it('streams text, sends the model unchanged and the app headers, and reads usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        ': OPENROUTER PROCESSING\n\n',
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n',
        'data: [DONE]\n\n',
      ])
    );
    vi.stubGlobal('fetch', fetchMock);
    const model = 'meta-llama/llama-3.3-70b-instruct:free';
    const out = await collect(
      openrouterAdapter.streamChat('or-key', model, [{ role: 'user', content: 'hi' }])
    );
    expect(out).toEqual([
      { chunk: 'Hi', done: false },
      { chunk: '', done: true, usage: { input_tokens: 7, output_tokens: 3 }, finish_reason: 'stop' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer or-key');
    expect(init.headers['X-Title']).toBe('Veda');
    expect(JSON.parse(init.body).model).toBe(model);
  });

  it('throws a ProviderError with the status on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'No auth credentials found' } }), { status: 401 })
      )
    );
    const gen = openrouterAdapter.streamChat('bad', 'm', [{ role: 'user', content: 'x' }]);
    await expect(gen.next()).rejects.toMatchObject({ status: 401, message: 'No auth credentials found' });
    await expect(
      openrouterAdapter.streamChat('bad', 'm', []).next()
    ).rejects.toBeInstanceOf(ProviderError);
  });

  it('throws when the stream carries an error object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse(['data: {"error":{"message":"Provider returned error","code":429}}\n\n'])
      )
    );
    const gen = openrouterAdapter.streamChat('k', 'm', [{ role: 'user', content: 'x' }]);
    await expect(gen.next()).rejects.toMatchObject({ status: 429 });
  });
});
