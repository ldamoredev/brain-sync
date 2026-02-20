import { ChatMessage } from '@brain-sync/types';

export interface LLMProvider {
    generateResponse(messages: ChatMessage[]): Promise<string>;
    generateStream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
}
