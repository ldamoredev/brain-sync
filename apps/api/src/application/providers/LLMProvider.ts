// apps/api/src/application/providers/LLMProvider.ts

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMProvider {
    generateResponse(messages: ChatMessage[]): Promise<string>;
    generateStream(messages: ChatMessage[]): AsyncIterable<string>
    // Podríamos agregar generateStream más adelante
}
