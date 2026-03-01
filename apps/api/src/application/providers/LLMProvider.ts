import { ChatMessage } from '@brain-sync/types';

export interface LLMProvider {
    // Existing methods
    generateResponse(messages: ChatMessage[]): Promise<string>;
    generateStream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string>;
    
    // New methods for RAG improvements
    scoreRelevance(query: string, document: string): Promise<number>;
    evaluateFaithfulness(context: string, answer: string): Promise<number>;
    evaluateAnswerRelevance(query: string, answer: string, expectedAnswer: string): Promise<number>;
}
