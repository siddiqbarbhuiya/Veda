export type RateConfig = {
  input_paise_per_1k_tokens: number;
  output_paise_per_1k_tokens: number;
};

// Integer-only math. Each part rounds up to the next whole paisa.
export function calculateCostPaise(
  inputTokens: number,
  outputTokens: number,
  rate: RateConfig
): number {
  if (inputTokens === 0 && outputTokens === 0) {
    return 0;
  }
  return (
    Math.ceil((inputTokens * rate.input_paise_per_1k_tokens) / 1000) +
    Math.ceil((outputTokens * rate.output_paise_per_1k_tokens) / 1000)
  );
}
