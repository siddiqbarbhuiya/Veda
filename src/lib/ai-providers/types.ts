export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface StreamChunk {
  chunk: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface ProviderAdapter {
  streamChat(
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): AsyncGenerator<StreamChunk>;
}
