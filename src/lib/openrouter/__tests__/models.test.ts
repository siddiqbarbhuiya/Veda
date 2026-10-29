import { describe, it, expect } from 'vitest';
import { parseModels, rateForModel } from '../models';

const sample = {
  data: [
    { id: 'a/free-one:free', name: 'Free One', context_length: 8000, pricing: { prompt: '0', completion: '0' } },
    { id: 'b/paid', name: 'Paid', context_length: 128000, pricing: { prompt: '0.000003', completion: '0.000015' } },
    { name: 'no id' },
    { id: 'c/odd', pricing: { prompt: 'x', completion: '-1' } },
  ],
};

describe('parseModels', () => {
  it('drops entries without an id and keeps the model id unchanged', () => {
    const list = parseModels(sample);
    expect(list.map((m) => m.id)).toEqual(['a/free-one:free', 'b/paid', 'c/odd']);
  });

  it('marks a model free only when both prices are 0', () => {
    const list = parseModels(sample);
    expect(list[0].free).toBe(true);
    expect(list[1].free).toBe(false);
  });

  it('treats an unreadable price as not free and prices it at 0 per token', () => {
    const odd = parseModels(sample)[2];
    expect(odd.free).toBe(false);
    expect(odd.prompt_usd_per_token).toBe(0);
    expect(odd.completion_usd_per_token).toBe(0);
  });

  it('returns [] for bad input', () => {
    expect(parseModels(null)).toEqual([]);
    expect(parseModels({ data: 'x' })).toEqual([]);
  });
});

describe('rateForModel', () => {
  const [free, paid] = parseModels(sample);
  it('returns 0 and 0 for a free model', () => {
    expect(rateForModel(free)).toEqual({ input_paise_per_1k_tokens: 0, output_paise_per_1k_tokens: 0 });
  });
  it('converts USD per token to paise per 1k tokens without float drift', () => {
    // 0.000003 USD x 1000 tokens x 90 INR x 100 paise = 27
    expect(rateForModel(paid, { usdInr: 90, margin: 1 })).toEqual({
      input_paise_per_1k_tokens: 27,
      output_paise_per_1k_tokens: 135,
    });
  });
  it('applies the margin and rounds up', () => {
    expect(rateForModel(paid, { usdInr: 90, margin: 1.1 }).input_paise_per_1k_tokens).toBe(30);
  });
});
