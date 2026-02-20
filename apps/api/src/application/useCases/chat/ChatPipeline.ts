import { RepositoryProvider } from '../../../infrastructure/repositories/RepositoryProvider';
import { VectorProvider } from '../../providers/VectorProvider';
import { LLMProvider } from '../../providers/LLMProvider';
import { PromptBuilder } from './PromptBuilder';
import { FaithfulnessGuard } from './FaithfulnessGuard';
import { ChatContext } from './ChatContext';
import { NoteRepository } from '../../../domain/entities/NoteRepository';
import { GraphRepository } from '../../../domain/entities/GraphRepository';
import { ChatStreamEvent } from '@brain-sync/types';

export class ChatPipeline {
    constructor(
        private repositories: RepositoryProvider,
        private vectorProvider: VectorProvider,
        private llm: LLMProvider,
        private promptBuilder: PromptBuilder,
        private faithfulnessGuard?: FaithfulnessGuard
    ) {}

    private async retrieve(ctx: ChatContext) {
        const embedding = await this.vectorProvider.generateEmbedding(
            ctx.question
        );

        ctx.notes = await this.repositories
            .get(NoteRepository)
            .findSimilar(embedding, 5, 0.5);
    }

    private async enrichGraph(ctx: ChatContext) {
        if (!ctx.notes.length) return;

        const ids = ctx.notes.map(n => n.id);

        ctx.graphRelations = await this.repositories
            .get(GraphRepository)
            .findContextualRelationships(ids);
    }

    private buildContext(ctx: ChatContext) {
        const notesString = ctx.notes
            .map((n, i) => `[Nota ${i + 1}]: ${n.content}`)
            .join('\n\n');

        const relationsString = ctx.graphRelations.length
            ? `\n\nRELACIONES:\n${ctx.graphRelations
                .map(r => `- ${r.source} ${r.type} ${r.target}`)
                .join('\n')}`
            : '';

        ctx.builtContext = notesString + relationsString;
    }

    async execute(ctx: ChatContext): Promise<void> {
        await this.retrieve(ctx);

        if (!ctx.notes.length) {
            ctx.answer =
                'No tengo notas guardadas que puedan responder a eso.';
            return;
        }

        await this.enrichGraph(ctx);
        this.buildContext(ctx);

        ctx.messages = this.promptBuilder.build(
            ctx.question,
            ctx.builtContext
        );

        ctx.answer = await this.llm.generateResponse(ctx.messages);

        if (this.faithfulnessGuard) {
            await this.faithfulnessGuard.verify(ctx);
        }
    }

    async *executeStream(
        ctx: ChatContext
    ): AsyncGenerator<ChatStreamEvent> {
        await this.retrieve(ctx);
        if (ctx.signal?.aborted) return;

        if (!ctx.notes.length) {
            yield { type: 'token', content: 'No tengo notas guardadas que puedan responder a eso.' };
            yield { type: 'done' };
            return;
        }

        yield {
            type: 'meta',
            sources: ctx.notes.map(n => ({ id: n.id, content: n.content }))
        };

        await this.enrichGraph(ctx);
        this.buildContext(ctx);

        ctx.messages = this.promptBuilder.build(
            ctx.question,
            ctx.builtContext
        );

        const stream = this.llm.generateStream(ctx.messages, ctx.signal);

        for await (const chunk of stream) {
            if (ctx.signal?.aborted) return;

            ctx.answer += chunk;

            yield {
                type: 'token',
                content: chunk
            };
        }

        if (this.faithfulnessGuard) {
            for await (const event of this.faithfulnessGuard.verifyStream(ctx)) {
                yield event;
            }
        }

        yield { type: 'done' };
    }
}