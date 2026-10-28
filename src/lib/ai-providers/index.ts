import type { ProviderAdapter } from './types';
import { openaiAdapter } from './openai';
import { geminiAdapter } from './gemini';
import { anthropicAdapter } from './anthropic';

export type { ChatMessage, TokenUsage, ProviderAdapter, StreamChunk } from './types';

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
