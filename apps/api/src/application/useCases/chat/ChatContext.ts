import { ChatMessage, ChatResponse } from '@brain-sync/types';

export class ChatContext {
    constructor(
        public question: string,
        public signal?: AbortSignal
    ) {}

    notes: any[] = [];
    graphRelations: any[] = [];

    builtContext = '';
    messages: ChatMessage[] = [];

    answer = '';
    isFaithful = true;

    metrics?: {
        faithfulness: number;
        answerRelevance: number;
    };

    toResponse(): ChatResponse {
        return {
            answer: this.answer,
            isFaithful: this.isFaithful,
            metrics: this.metrics,
            contextUsed: this.notes.map(n => ({
                id: n.id,
                content: n.content
            }))
        };
    }
}
