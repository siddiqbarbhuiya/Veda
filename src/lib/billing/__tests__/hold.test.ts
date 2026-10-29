import { describe, test, expect, beforeEach, vi } from 'vitest';

type ProfileRow = { id: string; balance_paise: number };

// In-memory fake of the Supabase query builder subset used by hold.ts.
const db = {
  profiles: [] as ProfileRow[],
  transactions: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
  // Runs once, just before the next UPDATE is evaluated. Simulates a concurrent request.
  beforeUpdate: null as null | (() => void),
};

function fakeClient() {
  return {
    from(table: string) {
      if (table === 'transactions') {
        return {
          insert(row: Record<string, unknown>) {
            db.transactions.push(row);
            return Promise.resolve({ error: db.insertError });
          },
        };
      }
      return {
        select() {
          return {
            eq(col: keyof ProfileRow, val: string) {
              return {
                single: async () => {
                  const row = db.profiles.find((r) => r[col] === val);
                  return row
                    ? { data: { balance_paise: row.balance_paise }, error: null }
                    : { data: null, error: { message: 'not found' } };
                },
              };
            },
          };
        },
        update(values: Partial<ProfileRow>) {
          const filters: Array<(r: ProfileRow) => boolean> = [];
          const builder = {
            eq(col: keyof ProfileRow, val: unknown) {
              filters.push((r) => r[col] === val);
              return builder;
            },
            gte(col: keyof ProfileRow, val: number) {
              filters.push((r) => (r[col] as number) >= val);
              return builder;
            },
            select() {
              const hook = db.beforeUpdate;
              db.beforeUpdate = null;
              hook?.();
              const matched = db.profiles.filter((r) => filters.every((f) => f(r)));
              matched.forEach((r) => Object.assign(r, values));
              return Promise.resolve({
                data: matched.map((r) => ({ balance_paise: r.balance_paise })),
                error: null,
              });
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

import { estimateHoldPaise, deductHold, settleHold } from '../hold';

const RATE = { input_paise_per_1k_tokens: 18, output_paise_per_1k_tokens: 72 };

beforeEach(() => {
  db.profiles = [{ id: 'user-1', balance_paise: 1000 }];
  db.transactions = [];
  db.insertError = null;
  db.beforeUpdate = null;
});

describe('estimateHoldPaise', () => {
  test('hold is clamped to minimum 10', () => {
    const tiny = { input_paise_per_1k_tokens: 1, output_paise_per_1k_tokens: 1 };
    expect(estimateHoldPaise(0, tiny)).toBe(10);
    expect(estimateHoldPaise(1, tiny)).toBe(10);
  });

  test('hold is clamped to maximum 500', () => {
    expect(estimateHoldPaise(10000, RATE)).toBe(500);
  });

  test('hold covers input at the input rate plus the assumed output at the output rate', () => {
    // input: ceil(200 * 18 / 1000) = 4; output: ceil(1024 * 72 / 1000) = 74; total 78
    expect(estimateHoldPaise(200, RATE)).toBe(78);
  });

  test('hold is never below the older 3x formula', () => {
    const cheapOutput = { input_paise_per_1k_tokens: 1, output_paise_per_1k_tokens: 10 };
    // legacy: ceil(5000 * 10 * 3 / 1000) = 150; full: 5 + 11 = 16
    expect(estimateHoldPaise(5000, cheapOutput)).toBe(150);
  });

  test('hold covers an input rate above the output rate', () => {
    const pricyInput = { input_paise_per_1k_tokens: 100, output_paise_per_1k_tokens: 10 };
    expect(estimateHoldPaise(2000, pricyInput)).toBeGreaterThanOrEqual(200);
  });
});

describe('deductHold', () => {
  test('returns success and new balance when balance is sufficient', async () => {
    const result = await deductHold('user-1', 100);
    expect(result).toEqual({ success: true, newBalance: 900 });
    expect(db.profiles[0].balance_paise).toBe(900);
  });

  test('returns failure with zero balance when balance is insufficient', async () => {
    db.profiles[0].balance_paise = 50;
    const result = await deductHold('user-1', 100);
    expect(result).toEqual({ success: false, newBalance: 0 });
    expect(db.profiles[0].balance_paise).toBe(50);
  });

  test('retries when a concurrent change makes the UPDATE match 0 rows', async () => {
    db.beforeUpdate = () => {
      db.profiles[0].balance_paise = 950;
    };
    const result = await deductHold('user-1', 100);
    expect(result).toEqual({ success: true, newBalance: 850 });
    expect(db.profiles[0].balance_paise).toBe(850);
  });

  test('returns failure when a concurrent request drains the balance', async () => {
    db.beforeUpdate = () => {
      db.profiles[0].balance_paise = 30;
    };
    const result = await deductHold('user-1', 100);
    expect(result).toEqual({ success: false, newBalance: 0 });
    expect(db.profiles[0].balance_paise).toBe(30);
  });
});

describe('changeBalance retries', () => {
  test('survives more than 5 conflicting writers', async () => {
    let conflicts = 0;
    const bump = () => {
      if (conflicts++ < 8) {
        db.profiles[0].balance_paise += 1;
        db.beforeUpdate = bump;
      }
    };
    db.beforeUpdate = bump;
    const result = await deductHold('user-1', 100);
    expect(result.success).toBe(true);
    expect(db.profiles[0].balance_paise).toBe(1000 + 8 - 100);
  });

  test('logs RECONCILE and throws after the final failed attempt', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bump = () => {
      db.profiles[0].balance_paise += 1;
      db.beforeUpdate = bump;
    };
    db.beforeUpdate = bump;
    await expect(deductHold('user-1', 100)).rejects.toThrow('conflicted too many times');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('RECONCILE'),
      expect.objectContaining({ userId: 'user-1' })
    );
    spy.mockRestore();
  });
});

describe('settleHold', () => {
  test('records no transaction and refunds the whole hold for a zero cost', async () => {
    db.profiles[0].balance_paise = 900;
    await settleHold('user-1', 100, 0);
    expect(db.profiles[0].balance_paise).toBe(1000);
    expect(db.transactions).toHaveLength(0);
  });

  test('refunds the difference when actual cost is below the hold', async () => {
    db.profiles[0].balance_paise = 900; // after a 100 paise hold
    await settleHold('user-1', 100, 30);
    expect(db.profiles[0].balance_paise).toBe(970);
  });

  test('inserts an ai_usage transaction with a negative amount and the new balance', async () => {
    db.profiles[0].balance_paise = 900;
    await settleHold('user-1', 100, 30);
    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0]).toMatchObject({
      user_id: 'user-1',
      type: 'ai_usage',
      amount_paise: -30,
      balance_after_paise: 970,
    });
  });

  test('caps cost at hold amount when actual cost exceeds the hold', async () => {
    db.profiles[0].balance_paise = 900;
    await settleHold('user-1', 100, 130);
    expect(db.profiles[0].balance_paise).toBe(900);
    expect(db.transactions[0]).toMatchObject({ amount_paise: -100, balance_after_paise: 900 });
  });

  test('throws when the transaction insert fails', async () => {
    db.insertError = { message: 'insert failed' };
    db.profiles[0].balance_paise = 900;
    await expect(settleHold('user-1', 100, 30)).rejects.toThrow();
  });
});
