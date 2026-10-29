/** A single message in a chat conversation. */
export interface ChatMessage {
  /** Who sent the message. */
  role: 'user' | 'assistant' | 'system';
  /** The message text. */
  content: string;
}

/** Token counts returned by the provider after a completion. */
export interface TokenUsage {
  /** Number of tokens in the prompt. */
  input_tokens: number;
  /** Number of tokens in the generated reply. */
  output_tokens: number;
}

/** One piece of a streaming response. */
export interface StreamChunk {
  /** Text fragment of the reply. */
  chunk: string;
  /** True on the final chunk. */
  done: boolean;
  /** Token counts. Present only on the final chunk. */
  usage?: TokenUsage;
}

/** Interface that each AI provider (OpenAI, Gemini, Anthropic) implements. */
export interface ProviderAdapter {
  /**
   * Opens a streaming chat completion and yields chunks.
   * @param apiKey - API key for the provider.
   * @param model - Provider model identifier.
   * @param messages - Conversation history to send.
   * @returns An async generator of stream chunks. The final chunk has `done` true and `usage`.
   */
  streamChat(
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): AsyncGenerator<StreamChunk>;
}
