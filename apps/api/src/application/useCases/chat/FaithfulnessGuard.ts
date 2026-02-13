import { ChatContext } from './ChatContext';
import { ChatStreamEvent } from '@brain-sync/types';
import { EvaluationService } from '../../../domain/services/EvaluationService';

export class FaithfulnessGuard {
    constructor(private evaluationService: EvaluationService) {
    }

    async verify(ctx: ChatContext): Promise<void> {
        const result = await this.evaluationService.evaluateFaithfulness(
            ctx.question,
            ctx.builtContext,
            ctx.answer
        );

        ctx.isFaithful = result.isFaithful;

        if (!result.isFaithful && result.correctedAnswer) {
            ctx.answer = result.correctedAnswer;
            ctx.isFaithful = true;
        }

        ctx.metrics = await this.evaluationService.calculateRagasMetrics(
            ctx.question,
            ctx.builtContext,
            ctx.answer
        );
    }

    async *verifyStream(
        ctx: ChatContext
    ): AsyncGenerator<ChatStreamEvent> {
        if (!ctx.answer) return;

        const result = await this.evaluationService.evaluateFaithfulness(
            ctx.question,
            ctx.builtContext,
            ctx.answer
        );

        ctx.isFaithful = result.isFaithful;

        yield {
            type: 'eval',
            isFaithful: result.isFaithful,
            reasoning: result.reasoning
        };
    }
}