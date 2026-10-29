// Script-aware token estimate shared by the client estimate and the server hold.
// Latin text is about 4 characters per token. Indic, CJK, Thai, Myanmar and similar
// scripts are about 1 token per character, so they use the 1:1 rule.

function isWideScript(code: number): boolean {
  return (
    (code >= 0x0900 && code <= 0x0dff) || // Devanagari to Sinhala (Indic scripts)
    (code >= 0x0e00 && code <= 0x0eff) || // Thai, Lao
    (code >= 0x1000 && code <= 0x109f) || // Myanmar
    (code >= 0x2e80 && code <= 0x9fff) || // CJK, kana
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7af) || // Hangul
    (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility
    (code >= 0xff00 && code <= 0xffef) // Full-width forms
  );
}

/** Estimated token count of one string. 0 for an empty string. */
export function estimateTokens(text: string): number {
  let wide = 0;
  let other = 0;
  for (let i = 0; i < text.length; i++) {
    if (isWideScript(text.charCodeAt(i))) wide++;
    else other++;
  }
  return wide + Math.ceil(other / 4);
}

const PER_MESSAGE_OVERHEAD_TOKENS = 4;

/** Estimated input tokens for a list of chat messages (content plus role overhead). */
export function estimateMessagesTokens(messages: ReadonlyArray<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content) + PER_MESSAGE_OVERHEAD_TOKENS, 0);
}
