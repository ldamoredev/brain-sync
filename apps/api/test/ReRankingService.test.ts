import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReRankingService, ReRankingConfig } from '../src/application/services/ReRankingService';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { RetrievalResult, RetrievalMetadata } from '../src/domain/entities/RetrievalResult';

describe('ReRankingService', () => {
    let reRankingService: ReRankingService;
    let mockLLMProvider: LLMProvider;

    // Helper function to create mock RetrievalResult objects
    const createMockRetrievalResult = (
        chunkId: string,
        noteId: string,
        content: string,
        score: number,
        chunkIndex: number = 0,
        retrievalMethod: 'semantic' | 'fulltext' | 'hybrid' = 'semantic'
    ): RetrievalResult => {
        const metadata: RetrievalMetadata = {
            chunkIndex,
            matchedChunkBounds: { start: 0, end: content.length },
            retrievalMethod
        };
        
        return new RetrievalResult(
            chunkId,
            noteId,
            content,
            content, // expandedContent same as content for simplicity
            score,
            metadata
        );
    };

    // Helper function to create multiple mock results
    const createMockResults = (count: number): RetrievalResult[] => {
        const results: RetrievalResult[] = [];
        for (let i = 0; i < count; i++) {
            results.push(createMockRetrievalResult(
                `chunk-${i}`,
                `note-${i}`,
                `Contenido del chunk ${i} sobre fotosíntesis y plantas`,
                0.8 - (i * 0.1), // Decreasing scores
                i
            ));
        }
        return results;
    };

    beforeEach(() => {
        mockLLMProvider = {
            generateResponse: vi.fn(),
            generateStream: vi.fn(),
            scoreRelevance: vi.fn(),
            evaluateFaithfulness: vi.fn(),
            evaluateAnswerRelevance: vi.fn()
        } as unknown as LLMProvider;

        reRankingService = new ReRankingService(mockLLMProvider);
    });

    describe('constructor and configuration', () => {
        it('should use default configuration when no config provided', () => {
            const service = new ReRankingService(mockLLMProvider);
            
            // Access private config through any to test defaults
            const config = (service as any).config;
            expect(config.enabled).toBe(true);
            expect(config.batchSize).toBe(5);
            expect(config.timeout).toBe(1000);
        });

        it('should merge provided configuration with defaults', () => {
            const customConfig: Partial<ReRankingConfig> = {
                enabled: false,
                batchSize: 3
            };
            
            const service = new ReRankingService(mockLLMProvider, customConfig);
            const config = (service as any).config;
            
            expect(config.enabled).toBe(false);
            expect(config.batchSize).toBe(3);
            expect(config.timeout).toBe(1000); // Should use default
        });

        it('should override all configuration values when provided', () => {
            const customConfig: ReRankingConfig = {
                enabled: false,
                batchSize: 10,
                timeout: 2000
            };
            
            const service = new ReRankingService(mockLLMProvider, customConfig);
            const config = (service as any).config;
            
            expect(config.enabled).toBe(false);
            expect(config.batchSize).toBe(10);
            expect(config.timeout).toBe(2000);
        });
    });

    describe('rerank - disabled configuration', () => {
        beforeEach(() => {
            reRankingService = new ReRankingService(mockLLMProvider, { enabled: false });
            vi.clearAllMocks();
        });

        it('should return original order when disabled', async () => {
            const results = createMockResults(5);
            const query = '¿Qué es la fotosíntesis?';
            const topK = 3;

            const rerankedResults = await reRankingService.rerank(results, query, topK);

            expect(rerankedResults).toHaveLength(3);
            expect(rerankedResults[0].chunkId).toBe('chunk-0');
            expect(rerankedResults[1].chunkId).toBe('chunk-1');
            expect(rerankedResults[2].chunkId).toBe('chunk-2');
            expect(mockLLMProvider.scoreRelevance).not.toHaveBeenCalled();
        });

        it('should return all results when topK exceeds result count and disabled', async () => {
            const results = createMockResults(3);
            const query = '¿Cómo funciona la respiración celular?';
            const topK = 10;

            const rerankedResults = await reRankingService.rerank(results, query, topK);

            expect(rerankedResults).toHaveLength(3);
            expect(rerankedResults).toEqual(results);
        });

        it('should handle empty results when disabled', async () => {
            const results: RetrievalResult[] = [];
            const query = 'test query';
            const topK = 5;

            const rerankedResults = await reRankingService.rerank(results, query, topK);

            expect(rerankedResults).toHaveLength(0);
            expect(mockLLMProvider.scoreRelevance).not.toHaveBeenCalled();
        });

        it('should handle negative topK when disabled', async () => {
            const results = createMockResults(5);
            const query = 'test query';
            const topK = -1;

            const rerankedResults = await reRankingService.rerank(results, query, topK);

            expect(rerankedResults).toHaveLength(0);
            expect(mockLLMProvider.scoreRelevance).not.toHaveBeenCalled();
        });
    });

    describe('rerank - enabled configuration', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should reorder results by relevance score', async () => {
            const results = [
                createMockRetrievalResult('chunk-1', 'note-1', 'Contenido menos relevante', 0.8),
                createMockRetrievalResult('chunk-2', 'note-2', 'Contenido muy relevante sobre fotosíntesis', 0.6),
                createMockRetrievalResult('chunk-3', 'note-3', 'Contenido moderadamente relevante', 0.7)
            ];

            // Mock LLM to return higher scores for more relevant content
            mockLLMProvider.scoreRelevance = vi.fn()
                .mockResolvedValueOnce(0.3) // chunk-1: low relevance
                .mockResolvedValueOnce(0.9) // chunk-2: high relevance
                .mockResolvedValueOnce(0.6); // chunk-3: medium relevance

            const query = '¿Qué es la fotosíntesis?';
            const rerankedResults = await reRankingService.rerank(results, query, 3);

            expect(rerankedResults).toHaveLength(3);
            expect(rerankedResults[0].chunkId).toBe('chunk-2'); // Highest score (0.9)
            expect(rerankedResults[1].chunkId).toBe('chunk-3'); // Medium score (0.6)
            expect(rerankedResults[2].chunkId).toBe('chunk-1'); // Lowest score (0.3)
        });

        it('should preserve original scores in metadata', async () => {
            const originalScore = 0.75;
            const rerankScore = 0.85;
            const result = createMockRetrievalResult('chunk-1', 'note-1', 'Test content', originalScore);

            mockLLMProvider.scoreRelevance = vi.fn().mockResolvedValue(rerankScore);

            const rerankedResults = await reRankingService.rerank([result], 'test query', 1);

            expect(rerankedResults[0].metadata.originalScore).toBe(originalScore);
            expect(rerankedResults[0].metadata.rerankScore).toBe(rerankScore);
            expect(rerankedResults[0].score).toBe(rerankScore); // New score should be the rerank score
        });

        it('should complete within 1000ms for 10 chunks', async () => {
            const results = createMockResults(10);
            
            // Mock fast LLM responses
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                Promise.resolve(Math.random())
            );

            const startTime = Date.now();
            await reRankingService.rerank(results, '¿Qué es la fotosíntesis?', 10);
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(1000);
        });

        it('should handle LLM scoring failures gracefully', async () => {
            const results = [
                createMockRetrievalResult('chunk-1', 'note-1', 'Content 1', 0.8),
                createMockRetrievalResult('chunk-2', 'note-2', 'Content 2', 0.7)
            ];

            // First call succeeds, second fails
            mockLLMProvider.scoreRelevance = vi.fn()
                .mockResolvedValueOnce(0.9)
                .mockRejectedValueOnce(new Error('LLM scoring failed'));

            const rerankedResults = await reRankingService.rerank(results, 'test query', 2);

            expect(rerankedResults).toHaveLength(2);
            // First result should have new score
            expect(rerankedResults[0].score).toBe(0.9);
            // Second result should preserve original score due to error
            expect(rerankedResults[1].score).toBe(0.7);
        });

        it('should return original results on complete failure', async () => {
            const results = createMockResults(3);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockRejectedValue(new Error('Complete LLM failure'));

            const rerankedResults = await reRankingService.rerank(results, 'test query', 3);

            expect(rerankedResults).toHaveLength(3);
            expect(rerankedResults).toEqual(results.slice(0, 3));
        });

        it('should respect topK parameter', async () => {
            const results = createMockResults(10);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                Promise.resolve(Math.random())
            );

            const rerankedResults = await reRankingService.rerank(results, 'test query', 5);

            expect(rerankedResults).toHaveLength(5);
        });

        it('should handle topK larger than result count', async () => {
            const results = createMockResults(3);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                Promise.resolve(Math.random())
            );

            const rerankedResults = await reRankingService.rerank(results, 'test query', 10);

            expect(rerankedResults).toHaveLength(3);
        });
    });

    describe('batchScore', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should process results in batches', async () => {
            const batchSize = 2;
            reRankingService = new ReRankingService(mockLLMProvider, { batchSize });
            
            const results = createMockResults(5); // 5 results with batch size 2 = 3 batches
            
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                Promise.resolve(0.5)
            );

            await (reRankingService as any).batchScore(results, 'test query');

            // Should be called 5 times (once per result)
            expect(mockLLMProvider.scoreRelevance).toHaveBeenCalledTimes(5);
        });

        it('should handle different batch sizes correctly', async () => {
            const testCases = [
                { batchSize: 1, resultCount: 5, expectedBatches: 5 },
                { batchSize: 3, resultCount: 7, expectedBatches: 3 }, // 3, 3, 1
                { batchSize: 10, resultCount: 5, expectedBatches: 1 }
            ];

            for (const testCase of testCases) {
                vi.clearAllMocks();
                
                const service = new ReRankingService(mockLLMProvider, { batchSize: testCase.batchSize });
                const results = createMockResults(testCase.resultCount);
                
                mockLLMProvider.scoreRelevance = vi.fn().mockResolvedValue(0.5);

                await (service as any).batchScore(results, 'test query');

                expect(mockLLMProvider.scoreRelevance).toHaveBeenCalledTimes(testCase.resultCount);
            }
        });

        it('should handle empty results', async () => {
            const results: RetrievalResult[] = [];
            
            const scoredResults = await (reRankingService as any).batchScore(results, 'test query');

            expect(scoredResults).toHaveLength(0);
            expect(mockLLMProvider.scoreRelevance).not.toHaveBeenCalled();
        });

        it('should preserve result order within batches', async () => {
            const batchSize = 2;
            reRankingService = new ReRankingService(mockLLMProvider, { batchSize });
            
            const results = createMockResults(4);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation((query, content) => {
                // Return different scores based on content to verify order
                if (content.includes('chunk 0')) return Promise.resolve(0.1);
                if (content.includes('chunk 1')) return Promise.resolve(0.2);
                if (content.includes('chunk 2')) return Promise.resolve(0.3);
                if (content.includes('chunk 3')) return Promise.resolve(0.4);
                return Promise.resolve(0.5);
            });

            const scoredResults = await (reRankingService as any).batchScore(results, 'test query');

            expect(scoredResults).toHaveLength(4);
            expect(scoredResults[0].chunkId).toBe('chunk-0');
            expect(scoredResults[1].chunkId).toBe('chunk-1');
            expect(scoredResults[2].chunkId).toBe('chunk-2');
            expect(scoredResults[3].chunkId).toBe('chunk-3');
        });
    });

    describe('timeout handling', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should handle timeout scenarios gracefully', async () => {
            const timeout = 100;
            reRankingService = new ReRankingService(mockLLMProvider, { timeout });
            
            const results = createMockResults(2);
            
            // Mock slow LLM response that exceeds timeout
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve(0.5), 200))
            );

            const rerankedResults = await reRankingService.rerank(results, 'test query', 2);

            // Should return original results due to timeout
            expect(rerankedResults).toHaveLength(2);
            expect(rerankedResults[0].score).toBe(results[0].score); // Original score preserved
            expect(rerankedResults[1].score).toBe(results[1].score);
        });

        it('should complete successfully when within timeout', async () => {
            const timeout = 500;
            reRankingService = new ReRankingService(mockLLMProvider, { timeout });
            
            const results = createMockResults(2);
            
            // Mock fast LLM response
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                Promise.resolve(0.9)
            );

            const rerankedResults = await reRankingService.rerank(results, 'test query', 2);

            expect(rerankedResults).toHaveLength(2);
            expect(rerankedResults[0].score).toBe(0.9); // New score applied
            expect(rerankedResults[1].score).toBe(0.9);
        });

        it('should handle mixed timeout scenarios in batches', async () => {
            const timeout = 150;
            const batchSize = 1;
            reRankingService = new ReRankingService(mockLLMProvider, { timeout, batchSize });
            
            const results = createMockResults(3);
            
            // First call fast, second slow (timeout), third fast
            mockLLMProvider.scoreRelevance = vi.fn()
                .mockImplementationOnce(() => Promise.resolve(0.9))
                .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(0.8), 200)))
                .mockImplementationOnce(() => Promise.resolve(0.7));

            const rerankedResults = await reRankingService.rerank(results, 'test query', 3);

            expect(rerankedResults).toHaveLength(3);
            // Results should be sorted by score, with timeout preserving original score
            expect(rerankedResults.some(r => r.score === 0.9)).toBe(true); // First succeeded
            expect(rerankedResults.some(r => r.score === 0.7)).toBe(true); // Third succeeded
        });
    });

    describe('createBatches utility', () => {
        it('should create correct number of batches', () => {
            const items = [1, 2, 3, 4, 5, 6, 7];
            const batchSize = 3;
            
            const batches = (reRankingService as any).createBatches(items, batchSize);
            
            expect(batches).toHaveLength(3);
            expect(batches[0]).toEqual([1, 2, 3]);
            expect(batches[1]).toEqual([4, 5, 6]);
            expect(batches[2]).toEqual([7]);
        });

        it('should handle empty arrays', () => {
            const items: number[] = [];
            const batchSize = 3;
            
            const batches = (reRankingService as any).createBatches(items, batchSize);
            
            expect(batches).toHaveLength(0);
        });

        it('should handle batch size larger than array', () => {
            const items = [1, 2, 3];
            const batchSize = 10;
            
            const batches = (reRankingService as any).createBatches(items, batchSize);
            
            expect(batches).toHaveLength(1);
            expect(batches[0]).toEqual([1, 2, 3]);
        });

        it('should handle batch size of 1', () => {
            const items = [1, 2, 3];
            const batchSize = 1;
            
            const batches = (reRankingService as any).createBatches(items, batchSize);
            
            expect(batches).toHaveLength(3);
            expect(batches[0]).toEqual([1]);
            expect(batches[1]).toEqual([2]);
            expect(batches[2]).toEqual([3]);
        });
    });

    describe('edge cases and error scenarios', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should handle single result', async () => {
            const result = createMockRetrievalResult('chunk-1', 'note-1', 'Single content', 0.8);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockResolvedValue(0.9);

            const rerankedResults = await reRankingService.rerank([result], 'test query', 1);

            expect(rerankedResults).toHaveLength(1);
            expect(rerankedResults[0].score).toBe(0.9);
            expect(rerankedResults[0].metadata.originalScore).toBe(0.8);
        });

        it('should handle topK of 0', async () => {
            const results = createMockResults(5);
            
            const rerankedResults = await reRankingService.rerank(results, 'test query', 0);

            expect(rerankedResults).toHaveLength(0);
            // Should not call LLM provider when topK is 0
            expect(mockLLMProvider.scoreRelevance).not.toHaveBeenCalled();
        });

        it('should handle negative topK', async () => {
            const results = createMockResults(5);
            
            const rerankedResults = await reRankingService.rerank(results, 'test query', -1);

            expect(rerankedResults).toHaveLength(0);
            // Should not call LLM provider when topK is negative
            expect(mockLLMProvider.scoreRelevance).not.toHaveBeenCalled();
        });

        it('should handle very large result sets', async () => {
            const results = createMockResults(100);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                Promise.resolve(Math.random())
            );

            const rerankedResults = await reRankingService.rerank(results, 'test query', 10);

            expect(rerankedResults).toHaveLength(10);
            expect(mockLLMProvider.scoreRelevance).toHaveBeenCalledTimes(100);
        });

        it('should handle special characters in query and content', async () => {
            const result = createMockRetrievalResult(
                'chunk-1', 
                'note-1', 
                'Contenido con caracteres especiales: @#$%^&*()_+{}|:"<>?[]\\;\',./', 
                0.8
            );
            
            mockLLMProvider.scoreRelevance = vi.fn().mockResolvedValue(0.9);

            const rerankedResults = await reRankingService.rerank(
                [result], 
                '¿Pregunta con símbolos @#$%?', 
                1
            );

            expect(rerankedResults).toHaveLength(1);
            expect(mockLLMProvider.scoreRelevance).toHaveBeenCalledWith(
                '¿Pregunta con símbolos @#$%?',
                'Contenido con caracteres especiales: @#$%^&*()_+{}|:"<>?[]\\;\',./'
            );
        });

        it('should handle empty query string', async () => {
            const results = createMockResults(2);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockResolvedValue(0.5);

            const rerankedResults = await reRankingService.rerank(results, '', 2);

            expect(rerankedResults).toHaveLength(2);
            expect(mockLLMProvider.scoreRelevance).toHaveBeenCalledWith('', expect.any(String));
        });

        it('should handle very long query strings', async () => {
            const longQuery = 'a'.repeat(10000);
            const results = createMockResults(1);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockResolvedValue(0.5);

            const rerankedResults = await reRankingService.rerank(results, longQuery, 1);

            expect(rerankedResults).toHaveLength(1);
            expect(mockLLMProvider.scoreRelevance).toHaveBeenCalledWith(longQuery, expect.any(String));
        });

        it('should handle concurrent rerank calls', async () => {
            const results1 = createMockResults(3);
            const results2 = createMockResults(2);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                Promise.resolve(Math.random())
            );

            const promises = [
                reRankingService.rerank(results1, 'query 1', 3),
                reRankingService.rerank(results2, 'query 2', 2)
            ];

            const [reranked1, reranked2] = await Promise.all(promises);

            expect(reranked1).toHaveLength(3);
            expect(reranked2).toHaveLength(2);
            expect(mockLLMProvider.scoreRelevance).toHaveBeenCalledTimes(5);
        });

        it('should preserve all metadata fields', async () => {
            const originalMetadata: RetrievalMetadata = {
                chunkIndex: 5,
                matchedChunkBounds: { start: 10, end: 50 },
                retrievalMethod: 'hybrid',
                originalScore: 0.75
            };
            
            const result = new RetrievalResult(
                'chunk-1',
                'note-1',
                'Test content',
                'Expanded test content',
                0.8,
                originalMetadata
            );
            
            mockLLMProvider.scoreRelevance = vi.fn().mockResolvedValue(0.9);

            const rerankedResults = await reRankingService.rerank([result], 'test query', 1);

            expect(rerankedResults[0].metadata).toEqual({
                ...originalMetadata,
                originalScore: 0.8, // Should be updated to the result's score
                rerankScore: 0.9
            });
        });

        it('should handle NaN and invalid scores from LLM', async () => {
            const result = createMockRetrievalResult('chunk-1', 'note-1', 'Test content', 0.8);
            
            mockLLMProvider.scoreRelevance = vi.fn().mockResolvedValue(NaN);

            const rerankedResults = await reRankingService.rerank([result], 'test query', 1);

            // Should handle NaN gracefully - the actual behavior depends on implementation
            expect(rerankedResults).toHaveLength(1);
            expect(rerankedResults[0].chunkId).toBe('chunk-1');
        });

        it('should handle undefined and null responses from LLM', async () => {
            const result = createMockRetrievalResult('chunk-1', 'note-1', 'Test content', 0.8);
            
            mockLLMProvider.scoreRelevance = vi.fn()
                .mockResolvedValueOnce(undefined as any)
                .mockResolvedValueOnce(null as any);

            // Test with undefined
            let rerankedResults = await reRankingService.rerank([result], 'test query', 1);
            expect(rerankedResults).toHaveLength(1);

            // Test with null  
            rerankedResults = await reRankingService.rerank([result], 'test query', 1);
            expect(rerankedResults).toHaveLength(1);
        });
    });

    describe('performance and latency requirements', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should complete reranking within 1000ms for 10 chunks with default config', async () => {
            const results = createMockResults(10);
            
            // Mock reasonably fast LLM responses (50ms each)
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve(Math.random()), 50))
            );

            const startTime = Date.now();
            const rerankedResults = await reRankingService.rerank(results, '¿Qué es la fotosíntesis?', 10);
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(1000);
            expect(rerankedResults).toHaveLength(10);
        });

        it('should handle batch processing efficiently', async () => {
            const batchSize = 3;
            reRankingService = new ReRankingService(mockLLMProvider, { batchSize });
            
            const results = createMockResults(9); // Exactly 3 batches
            
            let callCount = 0;
            mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => {
                callCount++;
                return Promise.resolve(0.5);
            });

            const startTime = Date.now();
            await reRankingService.rerank(results, 'test query', 9);
            const endTime = Date.now();

            expect(callCount).toBe(9);
            expect(endTime - startTime).toBeLessThan(500); // Should be fast with batching
        });

        it('should maintain performance with different batch sizes', async () => {
            const results = createMockResults(20);
            const batchSizes = [1, 5, 10, 20];
            
            for (const batchSize of batchSizes) {
                vi.clearAllMocks();
                
                const service = new ReRankingService(mockLLMProvider, { batchSize });
                
                mockLLMProvider.scoreRelevance = vi.fn().mockImplementation(() => 
                    Promise.resolve(Math.random())
                );

                const startTime = Date.now();
                const rerankedResults = await service.rerank(results, 'test query', 10);
                const endTime = Date.now();

                expect(rerankedResults).toHaveLength(10);
                expect(endTime - startTime).toBeLessThan(1000);
                expect(mockLLMProvider.scoreRelevance).toHaveBeenCalledTimes(20);
            }
        });
    });
});