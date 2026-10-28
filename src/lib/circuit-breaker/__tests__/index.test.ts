import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

type LogRow = { user_id: string; requested_at: string };

// In-memory fake of the Supabase query builder subset used by circuit-breaker/index.ts.
const db = {
  rows: [] as LogRow[],
  insertError: null as { message: string } | null,
};

function fakeClient() {
  return {
    from(table: string) {
      if (table !== 'circuit_breaker_log') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        insert(row: { user_id: string }) {
          db.rows.push({
            user_id: row.user_id,
            requested_at: new Date(Date.now()).toISOString(),
          });
          return Promise.resolve({ error: db.insertError });
        },
        select(_cols: string, _opts?: { count?: string; head?: boolean }) {
          const filters: Array<(r: LogRow) => boolean> = [];
          let ascending = true;
          let limit: number | null = null;
          const builder = {
            eq(col: keyof LogRow, val: string) {
              filters.push((r) => r[col] === val);
              return builder;
            },
            gt(col: keyof LogRow, val: string) {
              filters.push((r) => r[col] > val);
              return builder;
            },
            gte(col: keyof LogRow, val: string) {
              filters.push((r) => r[col] >= val);
              return builder;
            },
            order(_col: keyof LogRow, opts: { ascending: boolean }) {
              ascending = opts.ascending;
              return builder;
            },
            limit(n: number) {
              limit = n;
              return builder;
            },
            then(resolve: (v: unknown) => unknown) {
              let matched = db.rows.filter((r) => filters.every((f) => f(r)));
              const total = matched.length;
              matched = [...matched].sort((a, b) =>
                ascending
                  ? a.requested_at.localeCompare(b.requested_at)
                  : b.requested_at.localeCompare(a.requested_at)
              );
              if (limit !== null) matched = matched.slice(0, limit);
              return Promise.resolve({
                data: _opts?.head ? null : matched.map((r) => ({ requested_at: r.requested_at })),
                count: _opts?.count ? total : null,
                error: null,
              }).then(resolve);
            },
          };
          return builder;
        },
      };
    },
  };
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => fakeClient()),
}));

import { checkCircuitBreaker } from '../index';

const START = new Date('2026-10-29T10:00:00.000Z').getTime();

describe('checkCircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    db.rows = [];
    db.insertError = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('first request returns allowed with null retryAfterSeconds', async () => {
    const result = await checkCircuitBreaker('user-1');
    expect(result).toEqual({ allowed: true, retryAfterSeconds: null });
    expect(db.rows).toHaveLength(1);
  });

  test('10th request in 60s is still allowed', async () => {
    for (let i = 0; i < 9; i++) {
      await checkCircuitBreaker('user-1');
      vi.advanceTimersByTime(1000);
    }
    const tenth = await checkCircuitBreaker('user-1');
    expect(tenth).toEqual({ allowed: true, retryAfterSeconds: null });
  });

  test('11th request in 60s returns blocked with retryAfterSeconds', async () => {
    for (let i = 0; i < 10; i++) {
      await checkCircuitBreaker('user-1');
      vi.advanceTimersByTime(1000);
    }
    // Oldest request was at START. Window is 60s. Now is START + 10s.
    const eleventh = await checkCircuitBreaker('user-1');
    expect(eleventh.allowed).toBe(false);
    expect(typeof eleventh.retryAfterSeconds).toBe('number');
    expect(eleventh.retryAfterSeconds).toBe(50);
  });

  test('requests from other users do not count toward the limit', async () => {
    for (let i = 0; i < 10; i++) {
      await checkCircuitBreaker('user-1');
    }
    const other = await checkCircuitBreaker('user-2');
    expect(other).toEqual({ allowed: true, retryAfterSeconds: null });
  });

  test('requests older than 60s no longer count', async () => {
    for (let i = 0; i < 10; i++) {
      await checkCircuitBreaker('user-1');
    }
    vi.advanceTimersByTime(60_000);
    const result = await checkCircuitBreaker('user-1');
    expect(result).toEqual({ allowed: true, retryAfterSeconds: null });
  });

  test('throws when the insert fails', async () => {
    db.insertError = { message: 'insert failed' };
    await expect(checkCircuitBreaker('user-1')).rejects.toThrow('insert failed');
  });
});
