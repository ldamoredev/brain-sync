import { ChunkRepository, ChunkSearchResult } from '../../domain/entities/ChunkRepository';
import { VectorProvider } from '../providers/VectorProvider';
import { Chunk } from '../../domain/entities/Chunk';
import { RetrievalResult } from '../../domain/entities/RetrievalResult';
import logger from '../../infrastructure/logger';
import { AppError } from '../../domain/errors/AppError';

export interface HybridSearchConfig {
    threshold: number;
    rrfK: number;
    semanticWeight: number;
    fulltextWeight: number;
}

const SEARCH_TIMEOUT_MS = 500;

export class HybridSearchService {
    private config: HybridSearchConfig;

    constructor(
        private chunkRepository: ChunkRepository,
        private vectorProvider: VectorProvider,
        config?: Partial<HybridSearchConfig>
    ) {
        this.config = {
            threshold: config?.threshold ?? 0.5,
            rrfK: config?.rrfK ?? 60,
            semanticWeight: config?.semanticWeight ?? 0.5,
            fulltextWeight: config?.fulltextWeight ?? 0.5,
            ...config
        };
    }

    async search(query: string, topK: number): Promise<RetrievalResult[]> {
        const startTime = Date.now();
        
        // Generate embedding for query
        const queryEmbedding = await this.vectorProvider.generateEmbedding(query);
        
        // Execute semantic and full-text search in parallel with timeout
        const searchPromise = Promise.all([
            this.chunkRepository.semanticSearch(queryEmbedding, topK * 2, this.config.threshold),
            this.chunkRepository.fullTextSearch(query, topK * 2, this.config.threshold)
        ]);
        
        const timeoutPromise = this.createTimeoutPromise(SEARCH_TIMEOUT_MS);
        
        let semanticResults: ChunkSearchResult[];
        let ftResults: ChunkSearchResult[];
        
        try {
            [semanticResults, ftResults] = await Promise.race([searchPromise, timeoutPromise]);
        } catch (error) {
            if (error instanceof AppError && error.statusCode === 504) {
                throw error;
            }
            throw error;
        }
        
        const latency = Date.now() - startTime;
        logger.info('Hybrid search completed', { latency, query: query.substring(0, 50) });
        
        if (latency > SEARCH_TIMEOUT_MS) {
            logger.warn('Búsqueda híbrida excedió el umbral de latencia', { 
                latency, 
                threshold: SEARCH_TIMEOUT_MS,
                query: query.substring(0, 50)
            });
        }
        
        // Handle empty result sets gracefully
        if (semanticResults.length === 0 && ftResults.length === 0) {
            return [];
        }
        
        // Fuse results using RRF algorithm
        const fusedResults = this.fuseWithRRF(semanticResults, ftResults, topK);
        
        return fusedResults;
    }

    private createTimeoutPromise(timeoutMs: number): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new AppError('Tiempo de espera agotado para la búsqueda híbrida', 504));
            }, timeoutMs);
        });
    }

    private fuseWithRRF(
            semanticResults: ChunkSearchResult[],
            ftResults: ChunkSearchResult[],
            topK: number
        ): RetrievalResult[] {
            const k = this.config.rrfK;
            const scoreMap = new Map<string, { chunk: Chunk; score: number }>();

            // Process semantic results
            semanticResults.forEach((result, index) => {
                const rank = index + 1;
                const score = this.config.semanticWeight / (k + rank);

                const existing = scoreMap.get(result.chunk.id);
                if (existing) {
                    existing.score += score;
                } else {
                    scoreMap.set(result.chunk.id, { chunk: result.chunk, score });
                }
            });

            // Process full-text results
            ftResults.forEach((result, index) => {
                const rank = index + 1;
                const score = this.config.fulltextWeight / (k + rank);

                const existing = scoreMap.get(result.chunk.id);
                if (existing) {
                    existing.score += score;
                } else {
                    scoreMap.set(result.chunk.id, { chunk: result.chunk, score });
                }
            });

            // Sort by score and convert to RetrievalResult
            const sortedResults = Array.from(scoreMap.values())
                .sort((a, b) => b.score - a.score)
                .slice(0, topK)
                .map(({ chunk, score }) => new RetrievalResult(
                    chunk.id,
                    chunk.noteId,
                    chunk.content,
                    chunk.content,
                    score,
                    {
                        chunkIndex: chunk.chunkIndex,
                        matchedChunkBounds: { start: 0, end: chunk.content.length },
                        retrievalMethod: 'hybrid'
                    }
                ));

            return sortedResults;
        }
}