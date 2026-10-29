import type { ProviderAdapter } from './types';
import { openaiAdapter } from './openai';
import { geminiAdapter } from './gemini';
import { anthropicAdapter } from './anthropic';
import { openrouterAdapter } from './openrouter';
import { omnirouteAdapter } from './omniroute';

export type { ChatMessage, TokenUsage, ProviderAdapter, StreamChunk } from './types';
export { ProviderError } from './sse';

/**
 * Returns the adapter for a given provider name.
 * @param provider - Provider name: 'openai', 'gemini', 'anthropic' or 'openrouter'.
 * @returns The matching `ProviderAdapter`.
 * @throws {Error} If the provider name is unknown.
 */
export function getProviderAdapter(provider: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'omniroute'): ProviderAdapter {
  switch (provider) {
    case 'openai':
      return openaiAdapter;
    case 'gemini':
      return geminiAdapter;
    case 'anthropic':
      return anthropicAdapter;
    case 'openrouter':
      return openrouterAdapter;
    case 'omniroute':
      return omnirouteAdapter;
    default:
      throw new Error(`Unknown provider: ${String(provider)}`);
  }
}
