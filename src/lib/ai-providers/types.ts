/** A single message in a chat conversation. */
export interface ChatMessage {
  /** Who sent the message. */
  role: 'user' | 'assistant' | 'system';
  /** The message text. */
  content: string;
}

/** Token counts returned by the provider after a completion. */
export interface TokenUsage {
  /** Number of tokens in the prompt (includes cache tokens for Anthropic). */
  input_tokens: number;
  /** Number of tokens in the generated reply (includes thinking tokens for Gemini). */
  output_tokens: number;
}

/** One piece of a streaming response. */
export interface StreamChunk {
  /** Text fragment of the reply. */
  chunk: string;
  /** True on the final chunk. */
  done: boolean;
  /** Real token counts. Present only on the final chunk, and only when the provider sent them. */
  usage?: TokenUsage;
  /** Why the reply ended (for example "stop", "length", "max_tokens"). Final chunk only. */
  finish_reason?: string;
}

/** Interface that each AI provider (OpenAI, Gemini, Anthropic) implements. */
export interface ProviderAdapter {
  /**
   * Opens a streaming chat completion and yields chunks.
   * @param apiKey - API key for the provider.
   * @param model - Provider model identifier.
   * @param messages - Conversation history to send.
   * @param signal - Aborts the provider request and the stream when it fires.
   * @returns An async generator of stream chunks. The final chunk has `done` true.
   * `usage` stays undefined until the provider sends real counts.
   */
  streamChat(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    signal?: AbortSignal
  ): AsyncGenerator<StreamChunk>;
}
