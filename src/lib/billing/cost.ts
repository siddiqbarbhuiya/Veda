/** Per-model token pricing. */
export type RateConfig = {
  /** Price in paise per 1,000 input tokens. */
  input_paise_per_1k_tokens: number;
  /** Price in paise per 1,000 output tokens. */
  output_paise_per_1k_tokens: number;
};

// Integer-only math. Each part rounds up to the next whole paisa.
/**
 * Calculates the total cost of a request in paise.
 * @param inputTokens - Number of input tokens.
 * @param outputTokens - Number of output tokens.
 * @param rate - Per-1k-token rates in paise.
 * @returns Total cost as an integer in paise; input and output each round up via Math.ceil. 0 when both counts are 0.
 */
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
