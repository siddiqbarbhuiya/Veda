import { describe, test, expect } from 'vitest';
import { calculateCostPaise } from '../cost';

const GPT4O = { input_paise_per_1k_tokens: 18, output_paise_per_1k_tokens: 72 };

describe('calculateCostPaise', () => {
  test('zero tokens returns zero', () => {
    expect(calculateCostPaise(0, 0, GPT4O)).toBe(0);
  });

  test('rounds up partial tokens (1 input token at 18 paise/1k = 1 paisa)', () => {
    expect(calculateCostPaise(1, 0, GPT4O)).toBe(1);
  });

  test('1000 input + 1000 output at gpt-4o rates = 18 + 72 = 90', () => {
    expect(calculateCostPaise(1000, 1000, GPT4O)).toBe(90);
  });

  test('no floating point: 500 tokens at 1 paise/1k = 1 (ceil)', () => {
    expect(
      calculateCostPaise(500, 0, { input_paise_per_1k_tokens: 1, output_paise_per_1k_tokens: 3 })
    ).toBe(1);
  });
});
