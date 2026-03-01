import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridSearchService } from '../src/application/services/HybridSearchService';
import { ChunkRepository, ChunkSearchResult } from '../src/domain/entities/ChunkRepository';
import { VectorProvider } from '../src/application/providers/VectorProvider';
import { Chunk } from '../src/domain/entities/Chunk';
import { RetrievalResult } from '../src/domain/entities/RetrievalResult';
import { AppError } from '../src/domain/errors/AppError';

describe('HybridSearchService', () => {
    let hybridSearchService: HybridSearchService;
    let mockChunkRepository: ChunkRepository;
    let mockVectorProvider: VectorProvider;

    const createMockChunk = (id: string, noteId: string, content: string, chunkIndex: number): Chunk => {
        return new Chunk(
            id,
            noteId,
            content,
            chunkIndex,
            0,
            content.length,
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            new Date()
        );
    };

    const createMockChunkSearchResult = (chunk: Chunk, score: number, rank: number): ChunkSearchResult => {
        return { chunk, score, rank };
    };

    beforeEach(() => {
        mockChunkRepository = {
            semanticSearch: vi.fn(),
            fullTextSearch: vi.fn(),
            save: vi.fn(),
            saveBatch: vi.fn(),
            findById: vi.fn(),
            findByNoteId: vi.fn(),
            findExpandedContext: vi.fn(),
            deleteByNoteId: vi.fn()
        } as unknown as ChunkRepository;

        mockVectorProvider = {
            generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
        } as unknown as VectorProvider;

        hybridSearchService = new HybridSearchService(
            mockChunkRepository,
            mockVectorProvider,
            {
                threshold: 0.5,
                rrfK: 60,
                semanticWeight: 0.5,
                fulltextWeight: 0.5
            }
        );
    });

    describe('fuseWithRRF', () => {
        it('should combine results from both semantic and fulltext searches correctly', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'First chunk content', 0);
            const chunk2 = createMockChunk('chunk2', 'note1', 'Second chunk content', 1);
            const chunk3 = createMockChunk('chunk3', 'note2', 'Third chunk content', 0);

            const semanticResults = [
                createMockChunkSearchResult(chunk1, 0.9, 1),
                createMockChunkSearchResult(chunk2, 0.8, 2)
            ];

            const ftResults = [
                createMockChunkSearchResult(chunk2, 0.85, 1),
                createMockChunkSearchResult(chunk3, 0.75, 2)
            ];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            expect(results).toHaveLength(3);
            expect(results[0]).toBeInstanceOf(RetrievalResult);
            expect(results.every((r: RetrievalResult) => r.metadata.retrievalMethod === 'hybrid')).toBe(true);
            
            // Check that chunk2 appears only once (combined scores)
            const chunkIds = results.map((r: RetrievalResult) => r.chunkId);
            expect(chunkIds).toContain('chunk1');
            expect(chunkIds).toContain('chunk2');
            expect(chunkIds).toContain('chunk3');
            expect(new Set(chunkIds).size).toBe(3);
        });

        it('should handle empty semantic results (only fulltext)', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'First chunk content', 0);
            const chunk2 = createMockChunk('chunk2', 'note1', 'Second chunk content', 1);

            const semanticResults: ChunkSearchResult[] = [];
            const ftResults = [
                createMockChunkSearchResult(chunk1, 0.9, 1),
                createMockChunkSearchResult(chunk2, 0.8, 2)
            ];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            expect(results).toHaveLength(2);
            expect(results[0].chunkId).toBe('chunk1');
            expect(results[1].chunkId).toBe('chunk2');
            expect(results.every((r: RetrievalResult) => r.metadata.retrievalMethod === 'hybrid')).toBe(true);
        });

        it('should handle empty fulltext results (only semantic)', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'First chunk content', 0);
            const chunk2 = createMockChunk('chunk2', 'note1', 'Second chunk content', 1);

            const semanticResults = [
                createMockChunkSearchResult(chunk1, 0.9, 1),
                createMockChunkSearchResult(chunk2, 0.8, 2)
            ];
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            expect(results).toHaveLength(2);
            expect(results[0].chunkId).toBe('chunk1');
            expect(results[1].chunkId).toBe('chunk2');
            expect(results.every((r: RetrievalResult) => r.metadata.retrievalMethod === 'hybrid')).toBe(true);
        });

        it('should handle both empty result sets', () => {
            const semanticResults: ChunkSearchResult[] = [];
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            expect(results).toHaveLength(0);
        });

        it('should apply correct RRF formula: score = weight / (k + rank)', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'First chunk content', 0);
            
            const semanticResults = [
                createMockChunkSearchResult(chunk1, 0.9, 1) // array index 0 -> rank 1
            ];
            const ftResults = [
                createMockChunkSearchResult(chunk1, 0.8, 2) // array index 0 -> rank 1
            ];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            // Expected score: (0.5 / (60 + 1)) + (0.5 / (60 + 1)) = 0.5/61 + 0.5/61
            // Implementation uses array index + 1 as rank, not the rank field from ChunkSearchResult
            const expectedScore = (0.5 / 61) + (0.5 / 61);
            
            expect(results).toHaveLength(1);
            expect(results[0].score).toBeCloseTo(expectedScore, 6);
        });

        it('should combine scores for duplicate chunks correctly', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Duplicate chunk', 0);
            
            const semanticResults = [
                createMockChunkSearchResult(chunk1, 0.9, 1)
            ];
            const ftResults = [
                createMockChunkSearchResult(chunk1, 0.8, 1)
            ];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            // Expected combined score: (0.5 / (60 + 1)) + (0.5 / (60 + 1)) = 2 * (0.5 / 61)
            const expectedScore = 2 * (0.5 / 61);
            
            expect(results).toHaveLength(1);
            expect(results[0].score).toBeCloseTo(expectedScore, 6);
        });

        it('should sort results by score in descending order', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Low score chunk', 0);
            const chunk2 = createMockChunk('chunk2', 'note1', 'High score chunk', 1);
            
            const semanticResults = [
                createMockChunkSearchResult(chunk2, 0.9, 1), // array index 0 -> rank 1 -> higher RRF score
                createMockChunkSearchResult(chunk1, 0.5, 2)  // array index 1 -> rank 2 -> lower RRF score
            ];
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            expect(results).toHaveLength(2);
            expect(results[0].chunkId).toBe('chunk2'); // Higher score should be first
            expect(results[1].chunkId).toBe('chunk1');
            expect(results[0].score).toBeGreaterThan(results[1].score);
        });

        it('should limit results to topK', () => {
            const chunks = Array.from({ length: 10 }, (_, i) => 
                createMockChunk(`chunk${i}`, 'note1', `Content ${i}`, i)
            );
            
            const semanticResults = chunks.map((chunk, i) => 
                createMockChunkSearchResult(chunk, 1 - (i * 0.1), i + 1)
            );
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 3);

            expect(results).toHaveLength(3);
        });

        it('should preserve metadata correctly', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Test content', 5);
            
            const semanticResults = [
                createMockChunkSearchResult(chunk1, 0.9, 1)
            ];
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            expect(results).toHaveLength(1);
            expect(results[0].metadata).toEqual({
                chunkIndex: 5,
                matchedChunkBounds: { start: 0, end: chunk1.content.length },
                retrievalMethod: 'hybrid'
            });
        });
    });

    describe('search', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should execute both searches in parallel', async () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Test content', 0);
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults = [createMockChunkSearchResult(chunk1, 0.8, 1)];

            mockChunkRepository.semanticSearch = vi.fn().mockResolvedValue(semanticResults);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue(ftResults);

            const results = await hybridSearchService.search('test query', 5);

            expect(mockVectorProvider.generateEmbedding).toHaveBeenCalledWith('test query');
            expect(mockChunkRepository.semanticSearch).toHaveBeenCalledWith([0.1, 0.2, 0.3], 10, 0.5);
            expect(mockChunkRepository.fullTextSearch).toHaveBeenCalledWith('test query', 10, 0.5);
            expect(results).toHaveLength(1);
        });

        it('should complete within latency budget (500ms)', async () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Fast response', 0);
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults = [createMockChunkSearchResult(chunk1, 0.8, 1)];

            mockChunkRepository.semanticSearch = vi.fn().mockResolvedValue(semanticResults);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue(ftResults);

            const startTime = Date.now();
            const results = await hybridSearchService.search('test query', 5);
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(500);
            expect(results).toHaveLength(1);
        });

        it('should preserve metadata in results', async () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Test content with metadata', 3);
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults: ChunkSearchResult[] = [];

            mockChunkRepository.semanticSearch = vi.fn().mockResolvedValue(semanticResults);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue(ftResults);

            const results = await hybridSearchService.search('test query', 5);

            expect(results).toHaveLength(1);
            expect(results[0].metadata).toEqual({
                chunkIndex: 3,
                matchedChunkBounds: { start: 0, end: chunk1.content.length },
                retrievalMethod: 'hybrid'
            });
            expect(results[0].chunkId).toBe('chunk1');
            expect(results[0].noteId).toBe('note1');
            expect(results[0].content).toBe('Test content with metadata');
            expect(results[0].expandedContent).toBe('Test content with metadata');
        });

        it('should handle timeout scenarios', async () => {
            // Mock slow responses that exceed timeout
            mockChunkRepository.semanticSearch = vi.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve([]), 600))
            );
            mockChunkRepository.fullTextSearch = vi.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve([]), 600))
            );

            await expect(hybridSearchService.search('test query', 5))
                .rejects
                .toThrow(AppError);
        });

        it('should handle empty result sets gracefully', async () => {
            mockChunkRepository.semanticSearch = vi.fn().mockResolvedValue([]);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue([]);

            const results = await hybridSearchService.search('test query', 5);

            expect(results).toHaveLength(0);
        });

        it('should handle vector provider errors', async () => {
            mockVectorProvider.generateEmbedding = vi.fn().mockRejectedValue(new Error('Vector generation failed'));

            await expect(hybridSearchService.search('test query', 5))
                .rejects
                .toThrow('Vector generation failed');
        });

        it('should handle repository search errors', async () => {
            mockChunkRepository.semanticSearch = vi.fn().mockRejectedValue(new Error('Semantic search failed'));
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue([]);

            await expect(hybridSearchService.search('test query', 5))
                .rejects
                .toThrow('Semantic search failed');
        });

        it('should request double topK from repositories for better fusion', async () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Test content', 0);
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults = [createMockChunkSearchResult(chunk1, 0.8, 1)];

            mockChunkRepository.semanticSearch = vi.fn().mockResolvedValue(semanticResults);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue(ftResults);

            await hybridSearchService.search('test query', 5);

            expect(mockChunkRepository.semanticSearch).toHaveBeenCalledWith([0.1, 0.2, 0.3], 10, 0.5);
            expect(mockChunkRepository.fullTextSearch).toHaveBeenCalledWith('test query', 10, 0.5);
        });

        it('should handle AppError timeout correctly', async () => {
            const timeoutError = new AppError('Tiempo de espera agotado para la búsqueda híbrida', 504);
            
            mockChunkRepository.semanticSearch = vi.fn().mockRejectedValue(timeoutError);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue([]);

            await expect(hybridSearchService.search('test query', 5))
                .rejects
                .toThrow(timeoutError);
        });

        it('should re-throw non-AppError exceptions', async () => {
            const genericError = new Error('Generic error');
            
            mockChunkRepository.semanticSearch = vi.fn().mockRejectedValue(genericError);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue([]);

            await expect(hybridSearchService.search('test query', 5))
                .rejects
                .toThrow(genericError);
        });
    });

    describe('createTimeoutPromise', () => {
        it('should reject with AppError after timeout', async () => {
            const timeoutPromise = (hybridSearchService as any).createTimeoutPromise(100);

            await expect(timeoutPromise)
                .rejects
                .toThrow(AppError);
        });

        it('should reject with correct error message and status code', async () => {
            const timeoutPromise = (hybridSearchService as any).createTimeoutPromise(100);

            try {
                await timeoutPromise;
            } catch (error) {
                expect(error).toBeInstanceOf(AppError);
                expect((error as AppError).message).toBe('Tiempo de espera agotado para la búsqueda híbrida');
                expect((error as AppError).statusCode).toBe(504);
            }
        });
    });

    describe('configuration', () => {
        it('should use default configuration when none provided', () => {
            const service = new HybridSearchService(mockChunkRepository, mockVectorProvider);
            
            // Access private config through any cast to test defaults
            const config = (service as any).config;
            expect(config.threshold).toBe(0.5);
            expect(config.rrfK).toBe(60);
            expect(config.semanticWeight).toBe(0.5);
            expect(config.fulltextWeight).toBe(0.5);
        });

        it('should override default configuration with provided values', () => {
            const customConfig = {
                threshold: 0.7,
                rrfK: 100,
                semanticWeight: 0.6,
                fulltextWeight: 0.4
            };
            
            const service = new HybridSearchService(mockChunkRepository, mockVectorProvider, customConfig);
            
            const config = (service as any).config;
            expect(config.threshold).toBe(0.7);
            expect(config.rrfK).toBe(100);
            expect(config.semanticWeight).toBe(0.6);
            expect(config.fulltextWeight).toBe(0.4);
        });

        it('should partially override configuration', () => {
            const partialConfig = {
                rrfK: 80,
                semanticWeight: 0.7
            };
            
            const service = new HybridSearchService(mockChunkRepository, mockVectorProvider, partialConfig);
            
            const config = (service as any).config;
            expect(config.threshold).toBe(0.5); // default
            expect(config.rrfK).toBe(80); // overridden
            expect(config.semanticWeight).toBe(0.7); // overridden
            expect(config.fulltextWeight).toBe(0.5); // default
        });

        it('should use custom weights in RRF calculation', () => {
            const customService = new HybridSearchService(
                mockChunkRepository, 
                mockVectorProvider, 
                { semanticWeight: 0.8, fulltextWeight: 0.2, rrfK: 50 }
            );

            const chunk1 = createMockChunk('chunk1', 'note1', 'Test content', 0);
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults = [createMockChunkSearchResult(chunk1, 0.8, 1)];

            const results = (customService as any).fuseWithRRF(semanticResults, ftResults, 5);

            // Expected score: (0.8 / (50 + 1)) + (0.2 / (50 + 1)) = 1.0 / 51
            const expectedScore = 1.0 / 51;
            
            expect(results[0].score).toBeCloseTo(expectedScore, 6);
        });
    });

    describe('edge cases and error scenarios', () => {
        it('should handle very large result sets', async () => {
            const chunks = Array.from({ length: 1000 }, (_, i) => 
                createMockChunk(`chunk${i}`, `note${i}`, `Content ${i}`, i)
            );
            
            const semanticResults = chunks.slice(0, 500).map((chunk, i) => 
                createMockChunkSearchResult(chunk, 1 - (i * 0.001), i + 1)
            );
            const ftResults = chunks.slice(250, 750).map((chunk, i) => 
                createMockChunkSearchResult(chunk, 1 - (i * 0.001), i + 1)
            );

            mockChunkRepository.semanticSearch = vi.fn().mockResolvedValue(semanticResults);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue(ftResults);

            const results = await hybridSearchService.search('test query', 10);

            expect(results).toHaveLength(10);
            expect(results.every((r: RetrievalResult) => r.score > 0)).toBe(true);
        });

        it('should handle chunks with identical scores', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Content A', 0);
            const chunk2 = createMockChunk('chunk2', 'note1', 'Content B', 1);
            
            const semanticResults = [
                createMockChunkSearchResult(chunk1, 0.9, 1),
                createMockChunkSearchResult(chunk2, 0.9, 2)
            ];
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            expect(results).toHaveLength(2);
            // Both should have different scores due to different ranks
            expect(results[0].score).toBeGreaterThan(results[1].score);
        });

        it('should handle zero topK parameter', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Test content', 0);
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 0);

            expect(results).toHaveLength(0);
        });

        it('should handle negative topK parameter', () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Test content', 0);
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, -1);

            expect(results).toHaveLength(0);
        });

        it('should handle chunks with very long content', () => {
            const longContent = 'a'.repeat(10000);
            const chunk1 = createMockChunk('chunk1', 'note1', longContent, 0);
            
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults: ChunkSearchResult[] = [];

            const results = (hybridSearchService as any).fuseWithRRF(semanticResults, ftResults, 5);

            expect(results).toHaveLength(1);
            expect(results[0].content).toBe(longContent);
            expect(results[0].metadata.matchedChunkBounds.end).toBe(longContent.length);
        });

        it('should handle empty query string', async () => {
            const chunk1 = createMockChunk('chunk1', 'note1', 'Test content', 0);
            const semanticResults = [createMockChunkSearchResult(chunk1, 0.9, 1)];
            const ftResults = [createMockChunkSearchResult(chunk1, 0.8, 1)];

            mockChunkRepository.semanticSearch = vi.fn().mockResolvedValue(semanticResults);
            mockChunkRepository.fullTextSearch = vi.fn().mockResolvedValue(ftResults);

            const results = await hybridSearchService.search('', 5);

            expect(mockVectorProvider.generateEmbedding).toHaveBeenCalledWith('');
            expect(mockChunkRepository.fullTextSearch).toHaveBeenCalledWith('', 10, 0.5);
            expect(results).toHaveLength(1);
        });
    });
});