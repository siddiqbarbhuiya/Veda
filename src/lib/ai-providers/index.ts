import type { ProviderAdapter } from './types';
import { openaiAdapter } from './openai';
import { geminiAdapter } from './gemini';
import { anthropicAdapter } from './anthropic';

export type { ChatMessage, TokenUsage, ProviderAdapter, StreamChunk } from './types';

/**
 * Returns the adapter for a given provider name.
 * @param provider - Provider name: 'openai', 'gemini' or 'anthropic'.
 * @returns The matching `ProviderAdapter`.
 * @throws {Error} If the provider name is unknown.
 */
export function getProviderAdapter(provider: 'openai' | 'gemini' | 'anthropic'): ProviderAdapter {
  switch (provider) {
    case 'openai':
      return openaiAdapter;
    case 'gemini':
      return geminiAdapter;
    case 'anthropic':
      return anthropicAdapter;
    default:
      throw new Error(`Unknown provider: ${String(provider)}`);
  }
}
