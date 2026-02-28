import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DrizzleChunkRepository } from '../src/infrastructure/repositories/DrizzleChunkRepository';
import { Chunk } from '../src/domain/entities/Chunk';

// Mock the database module
vi.mock('../src/infrastructure/db', () => ({
    db: {
        insert: vi.fn(),
        select: vi.fn(),
        delete: vi.fn(),
    }
}));

// Mock the schema
vi.mock('../src/infrastructure/db/schema', () => ({
    chunks: {
        id: 'chunks.id',
        noteId: 'chunks.noteId',
        content: 'chunks.content',
        chunkIndex: 'chunks.chunkIndex',
        startChar: 'chunks.startChar',
        endChar: 'chunks.endChar',
        embedding: 'chunks.embedding',
        contextualEmbedding: 'chunks.contextualEmbedding',
        tsvector: 'chunks.tsvector',
        createdAt: 'chunks.createdAt',
    },
    notes: {
        id: 'notes.id',
        content: 'notes.content',
    }
}));

// Mock drizzle-orm functions
vi.mock('drizzle-orm', () => ({
    eq: vi.fn((field, value) => ({ field, value, type: 'eq' })),
    cosineDistance: vi.fn((field, value) => ({ field, value, type: 'cosineDistance' })),
    desc: vi.fn((field) => ({ field, type: 'desc' })),
    sql: vi.fn((strings, ...values) => ({ strings, values, type: 'sql' })),
    gt: vi.fn((field, value) => ({ field, value, type: 'gt' })),
    and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
}));

import { db } from '../src/infrastructure/db/index';

describe('ChunkRepository', () => {
    let chunkRepository: DrizzleChunkRepository;
    let mockInsert: any;
    let mockDelete: any;
    let mockFrom: any;
    let mockWhere: any;
    let mockOrderBy: any;
    let mockLimit: any;
    let mockValues: any;
    let queryResults: any[]; // Store query results for tests to modify
    let queryResultsQueue: any[][]; // Queue for multiple sequential queries

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        
        // Reset query results
        queryResults = [];
        queryResultsQueue = [];

        // Setup mock chain for insert
        mockValues = vi.fn().mockResolvedValue(undefined);
        mockInsert = {
            values: mockValues
        };
        (db.insert as any).mockReturnValue(mockInsert);

        // Setup mock chain for select
        // Create mock functions that return chainable objects
        // Use queue if available, otherwise use queryResults
        const getResults = () => {
            if (queryResultsQueue.length > 0) {
                return queryResultsQueue.shift()!;
            }
            return queryResults;
        };
        
        mockLimit = vi.fn((n: number) => Promise.resolve(getResults()));
        
        mockOrderBy = vi.fn((...args: any[]) => ({
            limit: mockLimit,
            then: (resolve: any) => resolve(getResults())
        }));
        
        mockWhere = vi.fn((...conditions: any[]) => ({
            orderBy: mockOrderBy,
            limit: mockLimit,
            then: (resolve: any) => resolve(getResults())
        }));
        
        mockFrom = vi.fn((table: any) => ({
            where: mockWhere,
            orderBy: mockOrderBy,
            limit: mockLimit,
            then: (resolve: any) => resolve(getResults())
        }));
        
        // Mock db.select to return an object with from method
        (db.select as any).mockImplementation((fields?: any) => ({
            from: mockFrom
        }));

        // Setup mock chain for delete
        mockDelete = {
            where: vi.fn().mockResolvedValue(undefined)
        };
        (db.delete as any).mockReturnValue(mockDelete);

        chunkRepository = new DrizzleChunkRepository();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('save()', () => {
        it('should persist a chunk with all fields correctly', async () => {
            // Arrange
            const chunk = new Chunk(
                'chunk-id-1',
                'note-id-1',
                'Este es el contenido del chunk.',
                0,
                0,
                30,
                [0.1, 0.2, 0.3],
                [0.4, 0.5, 0.6],
                new Date('2024-01-01T10:00:00Z')
            );

            // Act
            await chunkRepository.save(chunk);

            // Assert
            expect(db.insert).toHaveBeenCalledTimes(1);
            expect(mockValues).toHaveBeenCalledWith({
                id: 'chunk-id-1',
                noteId: 'note-id-1',
                content: 'Este es el contenido del chunk.',
                chunkIndex: 0,
                startChar: 0,
                endChar: 30,
                embedding: [0.1, 0.2, 0.3],
                contextualEmbedding: [0.4, 0.5, 0.6],
                createdAt: new Date('2024-01-01T10:00:00Z'),
            });
        });

        it('should handle chunks with empty embeddings', async () => {
            // Arrange
            const chunk = new Chunk(
                'chunk-id-2',
                'note-id-2',
                'Contenido sin embeddings.',
                1,
                31,
                55,
                [],
                [],
                new Date('2024-01-01T11:00:00Z')
            );

            // Act
            await chunkRepository.save(chunk);

            // Assert
            expect(mockValues).toHaveBeenCalledWith({
                id: 'chunk-id-2',
                noteId: 'note-id-2',
                content: 'Contenido sin embeddings.',
                chunkIndex: 1,
                startChar: 31,
                endChar: 55,
                embedding: [],
                contextualEmbedding: [],
                createdAt: new Date('2024-01-01T11:00:00Z'),
            });
        });

        it('should handle chunks with Spanish characters', async () => {
            // Arrange
            const chunk = new Chunk(
                'chunk-id-3',
                'note-id-3',
                '¿Cómo estás? ¡Muy bien! Ñoño español.',
                0,
                0,
                35,
                [0.7, 0.8, 0.9],
                [0.1, 0.3, 0.5],
                new Date()
            );

            // Act
            await chunkRepository.save(chunk);

            // Assert
            expect(mockValues).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: '¿Cómo estás? ¡Muy bien! Ñoño español.',
                })
            );
        });
    });

    describe('saveBatch()', () => {
        it('should handle multiple chunks atomically', async () => {
            // Arrange
            const chunks = [
                new Chunk('id-1', 'note-1', 'Chunk 1', 0, 0, 7, [0.1], [0.2], new Date()),
                new Chunk('id-2', 'note-1', 'Chunk 2', 1, 8, 15, [0.3], [0.4], new Date()),
                new Chunk('id-3', 'note-1', 'Chunk 3', 2, 16, 23, [0.5], [0.6], new Date()),
            ];

            // Act
            await chunkRepository.saveBatch(chunks);

            // Assert
            expect(db.insert).toHaveBeenCalledTimes(1);
            expect(mockValues).toHaveBeenCalledWith([
                {
                    id: 'id-1',
                    noteId: 'note-1',
                    content: 'Chunk 1',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 7,
                    embedding: [0.1],
                    contextualEmbedding: [0.2],
                    createdAt: chunks[0].createdAt,
                },
                {
                    id: 'id-2',
                    noteId: 'note-1',
                    content: 'Chunk 2',
                    chunkIndex: 1,
                    startChar: 8,
                    endChar: 15,
                    embedding: [0.3],
                    contextualEmbedding: [0.4],
                    createdAt: chunks[1].createdAt,
                },
                {
                    id: 'id-3',
                    noteId: 'note-1',
                    content: 'Chunk 3',
                    chunkIndex: 2,
                    startChar: 16,
                    endChar: 23,
                    embedding: [0.5],
                    contextualEmbedding: [0.6],
                    createdAt: chunks[2].createdAt,
                },
            ]);
        });

        it('should handle empty arrays gracefully', async () => {
            // Arrange
            const chunks: Chunk[] = [];

            // Act
            await chunkRepository.saveBatch(chunks);

            // Assert
            expect(db.insert).not.toHaveBeenCalled();
        });

        it('should handle single chunk in batch', async () => {
            // Arrange
            const chunks = [
                new Chunk('single-id', 'note-1', 'Single chunk', 0, 0, 12, [0.1], [0.2], new Date())
            ];

            // Act
            await chunkRepository.saveBatch(chunks);

            // Assert
            expect(db.insert).toHaveBeenCalledTimes(1);
            expect(mockValues).toHaveBeenCalledWith([
                expect.objectContaining({
                    id: 'single-id',
                    content: 'Single chunk',
                })
            ]);
        });
    });
    describe('semanticSearch()', () => {
        it('should return results ordered by similarity score', async () => {
            // Arrange
            const queryVector = [0.1, 0.2, 0.3];
            const mockResults = [
                {
                    id: 'chunk-1',
                    noteId: 'note-1',
                    content: 'High similarity content',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 23,
                    embedding: [0.1, 0.2, 0.3],
                    contextualEmbedding: [0.1, 0.2, 0.3],
                    createdAt: new Date('2024-01-01'),
                    similarity: 0.95,
                },
                {
                    id: 'chunk-2',
                    noteId: 'note-2',
                    content: 'Medium similarity content',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 25,
                    embedding: [0.2, 0.3, 0.4],
                    contextualEmbedding: [0.2, 0.3, 0.4],
                    createdAt: new Date('2024-01-02'),
                    similarity: 0.75,
                },
                {
                    id: 'chunk-3',
                    noteId: 'note-3',
                    content: 'Low similarity content',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 22,
                    embedding: [0.3, 0.4, 0.5],
                    contextualEmbedding: [0.3, 0.4, 0.5],
                    createdAt: new Date('2024-01-03'),
                    similarity: 0.55,
                },
            ];

            queryResults = mockResults;

            // Act
            const results = await chunkRepository.semanticSearch(queryVector, 10, 0.5);

            // Assert
            expect(results).toHaveLength(3);
            expect(results[0].score).toBe(0.95);
            expect(results[1].score).toBe(0.75);
            expect(results[2].score).toBe(0.55);
            expect(results[0].rank).toBe(1);
            expect(results[1].rank).toBe(2);
            expect(results[2].rank).toBe(3);
            expect(results[0].chunk.content).toBe('High similarity content');
        });

        it('should respect the threshold parameter', async () => {
            // Arrange
            const queryVector = [0.1, 0.2, 0.3];
            const mockResults = [
                {
                    id: 'chunk-1',
                    noteId: 'note-1',
                    content: 'Above threshold',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 15,
                    embedding: [0.1, 0.2, 0.3],
                    contextualEmbedding: [0.1, 0.2, 0.3],
                    createdAt: new Date(),
                    similarity: 0.85,
                },
            ];

            queryResults = mockResults;

            // Act
            const results = await chunkRepository.semanticSearch(queryVector, 10, 0.8);

            // Assert
            expect(mockWhere).toHaveBeenCalled();
            expect(results).toHaveLength(1);
            expect(results[0].score).toBe(0.85);
        });

        it('should respect the limit parameter', async () => {
            // Arrange
            const queryVector = [0.1, 0.2, 0.3];
            queryResults = [];

            // Act
            await chunkRepository.semanticSearch(queryVector, 5, 0.5);

            // Assert
            expect(mockLimit).toHaveBeenCalledWith(5);
        });

        it('should handle empty results', async () => {
            // Arrange
            const queryVector = [0.1, 0.2, 0.3];
            queryResults = [];

            // Act
            const results = await chunkRepository.semanticSearch(queryVector, 10, 0.9);

            // Assert
            expect(results).toHaveLength(0);
        });

        it('should handle null embeddings in results', async () => {
            // Arrange
            const queryVector = [0.1, 0.2, 0.3];
            const mockResults = [
                {
                    id: 'chunk-1',
                    noteId: 'note-1',
                    content: 'Content with null embeddings',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 28,
                    embedding: null,
                    contextualEmbedding: null,
                    createdAt: new Date(),
                    similarity: 0.75,
                },
            ];

            queryResults = mockResults;

            // Act
            const results = await chunkRepository.semanticSearch(queryVector, 10, 0.5);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].chunk.embedding).toEqual([]);
            expect(results[0].chunk.contextualEmbedding).toEqual([]);
        });
    });

    describe('fullTextSearch()', () => {
        it('should handle Spanish text correctly', async () => {
            // Arrange
            const query = 'análisis emocional';
            const mockResults = [
                {
                    id: 'chunk-1',
                    noteId: 'note-1',
                    content: 'Realizamos un análisis emocional profundo.',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 40,
                    embedding: [0.1, 0.2, 0.3],
                    contextualEmbedding: [0.1, 0.2, 0.3],
                    createdAt: new Date(),
                    rank: 0.8,
                },
                {
                    id: 'chunk-2',
                    noteId: 'note-2',
                    content: 'El análisis fue muy útil para entender las emociones.',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 53,
                    embedding: [0.2, 0.3, 0.4],
                    contextualEmbedding: [0.2, 0.3, 0.4],
                    createdAt: new Date(),
                    rank: 0.6,
                },
            ];

            queryResults = mockResults;

            // Act
            const results = await chunkRepository.fullTextSearch(query, 10, 0.1);

            // Assert
            expect(results).toHaveLength(2);
            expect(results[0].chunk.content).toContain('análisis emocional');
            expect(results[1].chunk.content).toContain('análisis');
        });

        it('should handle special characters in queries', async () => {
            // Arrange
            const query = '¿Cómo & cuándo?';
            const mockResults: any[] = [];
            queryResults = mockResults;

            // Act
            const results = await chunkRepository.fullTextSearch(query, 10, 0.1);

            // Assert - Should not throw error and handle escaped characters
            expect(results).toHaveLength(0);
            expect(mockWhere).toHaveBeenCalled();
        });

        it('should normalize scores to [0, 1] range', async () => {
            // Arrange
            const query = 'test query';
            const mockResults: any[] = [
                {
                    id: 'chunk-1',
                    noteId: 'note-1',
                    content: 'Test content 1',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 14,
                    embedding: [0.1],
                    contextualEmbedding: [0.1],
                    createdAt: new Date(),
                    rank: 1.5, // Raw PostgreSQL rank
                },
                {
                    id: 'chunk-2',
                    noteId: 'note-2',
                    content: 'Test content 2',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 14,
                    embedding: [0.2],
                    contextualEmbedding: [0.2],
                    createdAt: new Date(),
                    rank: 0.75, // Raw PostgreSQL rank
                },
            ];

            queryResults = mockResults;

            // Act
            const results = await chunkRepository.fullTextSearch(query, 10, 0.1);

            // Assert
            expect(results).toHaveLength(2);
            expect(results[0].score).toBe(1.0); // 1.5 / 1.5 = 1.0
            expect(results[1].score).toBe(0.5); // 0.75 / 1.5 = 0.5
            expect(results[0].score).toBeLessThanOrEqual(1.0);
            expect(results[1].score).toBeLessThanOrEqual(1.0);
        });

        it('should handle empty search results', async () => {
            // Arrange
            const query = 'nonexistent term';
            queryResults = [];

            // Act
            const results = await chunkRepository.fullTextSearch(query, 10, 0.1);

            // Assert
            expect(results).toHaveLength(0);
        });

        it('should respect threshold parameter', async () => {
            // Arrange
            const query = 'test';
            const mockResults = [
                {
                    id: 'chunk-1',
                    noteId: 'note-1',
                    content: 'High relevance test content',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 27,
                    embedding: [0.1],
                    contextualEmbedding: [0.1],
                    createdAt: new Date(),
                    rank: 0.8,
                },
            ];

            queryResults = mockResults;

            // Act
            await chunkRepository.fullTextSearch(query, 10, 0.5);

            // Assert
            expect(mockWhere).toHaveBeenCalled();
        });

        it('should handle queries with accented characters', async () => {
            // Arrange
            const query = 'niño corazón';
            const mockResults: any[] = [
                {
                    id: 'chunk-1',
                    noteId: 'note-1',
                    content: 'El niño tiene un corazón noble.',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 31,
                    embedding: [0.1],
                    contextualEmbedding: [0.1],
                    createdAt: new Date(),
                    rank: 0.9,
                },
            ];

            queryResults = mockResults;

            // Act
            const results = await chunkRepository.fullTextSearch(query, 10, 0.1);

            // Assert
            expect(results).toHaveLength(1);
            expect(results[0].chunk.content).toContain('niño');
            expect(results[0].chunk.content).toContain('corazón');
        });
    });
    describe('findExpandedContext()', () => {
        it('should expand by N sentences before and after', async () => {
            // Arrange
            const chunkId = 'chunk-1';
            const mockChunk = {
                id: chunkId,
                noteId: 'note-1',
                content: 'Esta es la oración objetivo.',
                chunkIndex: 1,
                startChar: 34,
                endChar: 63,
                embedding: [0.1],
                contextualEmbedding: [0.1],
                createdAt: new Date(),
            };

            const mockNoteContent = 'Primera oración. Segunda oración. Esta es la oración objetivo. Cuarta oración. Quinta oración.';
            
            // Mock findById to return the chunk, then note content query
            queryResultsQueue = [[mockChunk], [{ content: mockNoteContent }]];

            // Act
            const context = await chunkRepository.findExpandedContext(chunkId, 1, 1);

            // Assert
            expect(context).toContain('Segunda oración');
            expect(context).toContain('Esta es la oración objetivo');
            expect(context).toContain('Cuarta oración');
        });

        it('should respect note boundaries', async () => {
            // Arrange
            const chunkId = 'chunk-1';
            const mockChunk = {
                id: chunkId,
                noteId: 'note-1',
                content: 'Primera oración de la nota.',
                chunkIndex: 0,
                startChar: 0,
                endChar: 26,
                embedding: [0.1],
                contextualEmbedding: [0.1],
                createdAt: new Date(),
            };

            const mockNoteContent = 'Primera oración de la nota. Segunda oración.';
            
            queryResultsQueue = [[mockChunk], [{ content: mockNoteContent }]];

            // Act - Request 5 sentences before (should not go beyond note start)
            const context = await chunkRepository.findExpandedContext(chunkId, 5, 1);

            // Assert
            expect(context).toContain('Primera oración de la nota');
            expect(context).toContain('Segunda oración');
            // Should not contain content from other notes or throw errors
        });

        it('should return empty string for non-existent chunk', async () => {
            // Arrange
            const chunkId = 'non-existent-chunk';
            queryResultsQueue = [[]]; // No chunk found

            // Act
            const context = await chunkRepository.findExpandedContext(chunkId, 2, 2);

            // Assert
            expect(context).toBe('');
        });

        it('should handle chunks at note boundaries', async () => {
            // Arrange
            const chunkId = 'last-chunk';
            const mockChunk = {
                id: chunkId,
                noteId: 'note-1',
                content: 'Última oración.',
                chunkIndex: 2,
                startChar: 60,
                endChar: 75,
                embedding: [0.1],
                contextualEmbedding: [0.1],
                createdAt: new Date(),
            };

            const mockNoteContent = 'Primera oración. Segunda oración. Tercera oración. Última oración.';
            
            queryResultsQueue = [[mockChunk], [{ content: mockNoteContent }]];

            // Act - Request sentences after the last chunk
            const context = await chunkRepository.findExpandedContext(chunkId, 2, 5);

            // Assert
            expect(context).toContain('Última oración');
            expect(context).toContain('Segunda oración');
            expect(context).toContain('Tercera oración');
        });

        it('should handle missing note content', async () => {
            // Arrange
            const chunkId = 'chunk-1';
            const mockChunk = {
                id: chunkId,
                noteId: 'missing-note',
                content: 'Chunk content',
                chunkIndex: 0,
                startChar: 0,
                endChar: 13,
                embedding: [0.1],
                contextualEmbedding: [0.1],
                createdAt: new Date(),
            };

            queryResultsQueue = [[mockChunk], []]; // First query returns chunk, second returns no note

            // Act
            const context = await chunkRepository.findExpandedContext(chunkId, 1, 1);

            // Assert
            expect(context).toBe('Chunk content'); // Should return just the chunk content
        });

        it('should handle Spanish sentence boundaries correctly', async () => {
            // Arrange
            const chunkId = 'spanish-chunk';
            const mockChunk = {
                id: chunkId,
                noteId: 'note-1',
                content: '¿Cómo estás?',
                chunkIndex: 1,
                startChar: 22,
                endChar: 34,
                embedding: [0.1],
                contextualEmbedding: [0.1],
                createdAt: new Date(),
            };

            const mockNoteContent = 'Hola amigo. ¡Qué tal! ¿Cómo estás? ¡Muy bien! Gracias por preguntar.';
            
            queryResultsQueue = [[mockChunk], [{ content: mockNoteContent }]];

            // Act
            const context = await chunkRepository.findExpandedContext(chunkId, 1, 1);

            // Assert
            expect(context).toContain('¡Qué tal!');
            expect(context).toContain('¿Cómo estás?');
            expect(context).toContain('¡Muy bien!');
        });
    });

    describe('deleteByNoteId()', () => {
        it('should remove all chunks for a note', async () => {
            // Arrange
            const noteId = 'note-to-delete';

            // Act
            await chunkRepository.deleteByNoteId(noteId);

            // Assert
            expect(db.delete).toHaveBeenCalledTimes(1);
            expect(mockDelete.where).toHaveBeenCalled();
        });

        it('should not affect chunks from other notes', async () => {
            // Arrange
            const noteId = 'specific-note';

            // Act
            await chunkRepository.deleteByNoteId(noteId);

            // Assert
            expect(db.delete).toHaveBeenCalledTimes(1);
            // The where clause should be called to filter by noteId
            expect(mockDelete.where).toHaveBeenCalled();
        });

        it('should handle deletion of non-existent note gracefully', async () => {
            // Arrange
            const noteId = 'non-existent-note';

            // Act & Assert - Should not throw
            await expect(chunkRepository.deleteByNoteId(noteId)).resolves.toBeUndefined();
            expect(db.delete).toHaveBeenCalledTimes(1);
        });
    });

    describe('findById()', () => {
        it('should return chunk when found', async () => {
            // Arrange
            const chunkId = 'existing-chunk';
            const mockResult = [{
                id: chunkId,
                noteId: 'note-1',
                content: 'Found chunk content',
                chunkIndex: 0,
                startChar: 0,
                endChar: 18,
                embedding: [0.1, 0.2, 0.3],
                contextualEmbedding: [0.4, 0.5, 0.6],
                createdAt: new Date('2024-01-01'),
            }];

            queryResults = mockResult;

            // Act
            const chunk = await chunkRepository.findById(chunkId);

            // Assert
            expect(chunk).toBeInstanceOf(Chunk);
            expect(chunk!.id).toBe(chunkId);
            expect(chunk!.content).toBe('Found chunk content');
            expect(chunk!.embedding).toEqual([0.1, 0.2, 0.3]);
            expect(chunk!.contextualEmbedding).toEqual([0.4, 0.5, 0.6]);
        });

        it('should return undefined when chunk not found', async () => {
            // Arrange
            const chunkId = 'non-existent-chunk';
            queryResults = [];

            // Act
            const chunk = await chunkRepository.findById(chunkId);

            // Assert
            expect(chunk).toBeUndefined();
        });

        it('should handle null embeddings', async () => {
            // Arrange
            const chunkId = 'chunk-with-null-embeddings';
            const mockResult = [{
                id: chunkId,
                noteId: 'note-1',
                content: 'Content without embeddings',
                chunkIndex: 0,
                startChar: 0,
                endChar: 26,
                embedding: null,
                contextualEmbedding: null,
                createdAt: new Date(),
            }];

            queryResults = mockResult;

            // Act
            const chunk = await chunkRepository.findById(chunkId);

            // Assert
            expect(chunk).toBeInstanceOf(Chunk);
            expect(chunk!.embedding).toEqual([]);
            expect(chunk!.contextualEmbedding).toEqual([]);
        });
    });

    describe('findByNoteId()', () => {
        it('should return chunks ordered by chunk index', async () => {
            // Arrange
            const noteId = 'note-with-chunks';
            const mockResults = [
                {
                    id: 'chunk-1',
                    noteId: noteId,
                    content: 'First chunk',
                    chunkIndex: 0,
                    startChar: 0,
                    endChar: 11,
                    embedding: [0.1],
                    contextualEmbedding: [0.1],
                    createdAt: new Date(),
                },
                {
                    id: 'chunk-2',
                    noteId: noteId,
                    content: 'Second chunk',
                    chunkIndex: 1,
                    startChar: 12,
                    endChar: 24,
                    embedding: [0.2],
                    contextualEmbedding: [0.2],
                    createdAt: new Date(),
                },
            ];

            queryResults = mockResults;

            // Act
            const chunks = await chunkRepository.findByNoteId(noteId);

            // Assert
            expect(chunks).toHaveLength(2);
            expect(chunks[0].chunkIndex).toBe(0);
            expect(chunks[1].chunkIndex).toBe(1);
            expect(chunks[0].content).toBe('First chunk');
            expect(chunks[1].content).toBe('Second chunk');
            expect(mockOrderBy).toHaveBeenCalled();
        });

        it('should return empty array for note with no chunks', async () => {
            // Arrange
            const noteId = 'note-without-chunks';
            queryResults = [];

            // Act
            const chunks = await chunkRepository.findByNoteId(noteId);

            // Assert
            expect(chunks).toHaveLength(0);
        });
    });

    describe('error handling', () => {
        it('should handle database errors in save()', async () => {
            // Arrange
            const chunk = new Chunk('id', 'noteId', 'content', 0, 0, 7, [], [], new Date());
            mockValues.mockRejectedValue(new Error('Database error'));

            // Act & Assert
            await expect(chunkRepository.save(chunk)).rejects.toThrow('Database error');
        });

        it('should handle database errors', async () => {
            // Arrange
            const queryVector = [0.1, 0.2, 0.3];
            // Make the limit function throw an error
            mockLimit.mockRejectedValue(new Error('Search error'));

            // Act & Assert
            await expect(chunkRepository.semanticSearch(queryVector, 10, 0.5)).rejects.toThrow('Search error');
        });

        it('should handle database errors in deleteByNoteId()', async () => {
            // Arrange
            const noteId = 'note-id';
            mockDelete.where = vi.fn().mockRejectedValue(new Error('Delete error'));

            // Act & Assert
            await expect(chunkRepository.deleteByNoteId(noteId)).rejects.toThrow('Delete error');
        });
    });
});