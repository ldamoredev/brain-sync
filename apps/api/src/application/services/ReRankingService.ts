import { LLMProvider } from '../providers/LLMProvider';
import { RetrievalResult } from '../../domain/entities/RetrievalResult';
import logger from '../../infrastructure/logger';

export interface ReRankingConfig {
    enabled: boolean;
    batchSize: number;
    timeout: number;
}

export class ReRankingService {
    private config: ReRankingConfig;

    constructor(
        private llmProvider: LLMProvider,
        config?: Partial<ReRankingConfig>
    ) {
        this.config = {
            enabled: config?.enabled ?? true,
            batchSize: config?.batchSize ?? 5,
            timeout: config?.timeout ?? 1000,
            ...config
        };
    }

    async rerank(results: RetrievalResult[], query: string, topK: number): Promise<RetrievalResult[]> {
        // Add validation for topK
        if (topK <= 0) {
            logger.warn('Invalid topK value, returning empty results', { topK });
            return [];
        }
        
        if (!this.config.enabled) {
            logger.info('Re-ranking disabled, returning original results', { count: results.length });
            return results.slice(0, topK);
        }

        const startTime = Date.now();

        try {
            const scoredResults = await this.batchScore(results, query);
            scoredResults.sort((a, b) => b.score - a.score);

            const latency = Date.now() - startTime;
            logger.info('Re-ranking completed', {
                latency,
                originalCount: results.length,
                topK,
                query: query.substring(0, 50)
            });

            return scoredResults.slice(0, topK);
        } catch (error) {
            logger.error('Error during re-ranking, returning original results', {
                error: error instanceof Error ? error.message : 'Unknown error',
                query: query.substring(0, 50)
            });
            return results.slice(0, topK);
        }
    }

    private async batchScore(results: RetrievalResult[], query: string): Promise<RetrievalResult[]> {
        const batches = this.createBatches(results, this.config.batchSize);

        const scoredBatches = await Promise.all(
            batches.map(batch => this.withTimeout(
                this.scoreBatch(batch, query),
                this.config.timeout,
                batch
            ))
        );

        return scoredBatches.flat();
    }

    private async scoreBatch(batch: RetrievalResult[], query: string): Promise<RetrievalResult[]> {
        return Promise.all(
            batch.map(async result => {
                try {
                    const score = await this.llmProvider.scoreRelevance(query, result.content);

                    return new RetrievalResult(
                        result.chunkId,
                        result.noteId,
                        result.content,
                        result.expandedContent,
                        score,
                        {
                            ...result.metadata,
                            originalScore: result.score,
                            rerankScore: score
                        }
                    );
                } catch (error) {
                    logger.error('Error scoring individual result, preserving original score', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        chunkId: result.chunkId
                    });
                    return result;
                }
            })
        );
    }

    private async withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number,
        fallbackBatch: RetrievalResult[]
    ): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Batch scoring timeout after ${timeoutMs}ms`));
            }, timeoutMs);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } catch (error) {
            if (error instanceof Error && error.message.includes('timeout')) {
                logger.warn('Batch scoring timeout, preserving original scores', {
                    timeout: timeoutMs,
                    batchSize: fallbackBatch.length
                });
                return fallbackBatch as T;
            }
            throw error;
        }
    }

    private createBatches<T>(items: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
}
