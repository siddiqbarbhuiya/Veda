/** Error from a provider HTTP response. Carries the status and the Retry-After value. */
export class ProviderError extends Error {
  status: number;
  /** Seconds from the Retry-After header, when present. */
  retryAfter?: number;
  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Throw a ProviderError carrying the provider's error message for a non-OK response. */
export async function throwProviderError(res: Response, provider: string): Promise<never> {
  let message = `${provider} request failed with status ${res.status}`;
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      const m = json?.error?.message ?? json?.message;
      if (typeof m === 'string' && m) message = m;
      else if (text) message = text;
    } catch {
      if (text) message = text;
    }
  } catch {
    // keep default message
  }
  const header = Number(res.headers?.get?.('retry-after'));
  throw new ProviderError(message, res.status, Number.isFinite(header) && header > 0 ? header : undefined);
}

/** Parse an SSE response body into the `data:` payload strings of each event. */
export async function* readSSEData(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error('Provider response has no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).replace(/\r$/, '');
        buffer = buffer.slice(idx + 1);
        if (line.startsWith('data:')) yield line.slice(5).trim();
      }
    }
    buffer += decoder.decode();
    const last = buffer.replace(/\r$/, '');
    if (last.startsWith('data:')) yield last.slice(5).trim();
  } finally {
    // Stop the upstream connection on early exit (break, abort, consumer error).
    try {
      await reader.cancel();
    } catch {
      // Already closed or errored.
    }
    reader.releaseLock();
  }
}
