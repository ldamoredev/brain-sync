import { ChatPipeline } from './ChatPipeline';
import { ChatContext } from './ChatContext';
import { ChatResponse, ChatStreamEvent } from '@brain-sync/types';

export class Chat {
    constructor(private pipeline: ChatPipeline) {}

    async execute(question: string): Promise<ChatResponse> {
        const ctx = new ChatContext(question);

        await this.pipeline.execute(ctx);

        return ctx.toResponse();
    }

    async *executeStream(
        question: string,
        options?: { signal?: AbortSignal }
    ): AsyncGenerator<ChatStreamEvent> {
        const ctx = new ChatContext(question, options?.signal);

        for await (const event of this.pipeline.executeStream(ctx)) {
            yield event;
        }
    }
}
