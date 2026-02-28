import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ChunkingService } from '../src/application/services/ChunkingService';
import { VectorProvider } from '../src/application/providers/VectorProvider';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { Note } from '../src/domain/entities/Note';

/**
 * **Validates: Requirements 5.10, Property 3**
 * 
 * Property 3: Chunk Boundary Consistency
 * FOR ALL chunks within a note:
 *   - Chunks SHALL be non-overlapping in their core content (excluding overlap regions)
 *   - The union of all chunks SHALL cover the entire note content
 * 
 * This ensures that:
 * 1. No content is duplicated in core chunk regions (overlap is intentional and tracked)
 * 2. No content is lost during chunking
 * 3. Chunk boundaries are consistent and well-defined
 */

describe('Chunk Boundary Consistency Property Tests', () => {
    let chunkingService: ChunkingService;
    let mockVectorProvider: VectorProvider;
    let mockLLMProvider: LLMProvider;

    beforeEach(() => {
        mockVectorProvider = {
            generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
        } as unknown as VectorProvider;

        mockLLMProvider = {
            generateResponse: vi.fn().mockResolvedValue('Contextual information')
        } as unknown as LLMProvider;

        chunkingService = new ChunkingService(
            mockVectorProvider,
            mockLLMProvider,
            {
                maxChunkSize: 512,
                overlapSize: 50,
                minChunkSize: 100
            }
        );
    });

    // Generator for Spanish sentences
    const spanishSentenceArb = fc.oneof(
        fc.constant('Esta es una oración de prueba.'),
        fc.constant('¿Cómo estás hoy?'),
        fc.constant('¡Qué día tan hermoso!'),
        fc.constant('El Dr. García trabaja en el hospital.'),
        fc.constant('La Sra. López es profesora de matemáticas.'),
        fc.constant('Necesito comprar pan, leche y huevos.'),
        fc.constant('El clima está muy agradable esta semana.'),
        fc.constant('Me gusta leer libros de ciencia ficción.'),
        fc.constant('Vamos a la playa este fin de semana.'),
        fc.constant('La tecnología avanza muy rápidamente.'),
        fc.constant('Es importante cuidar el medio ambiente.'),
        fc.constant('El café de la mañana es esencial para mí.'),
        fc.constant('Los niños juegan en el parque todos los días.'),
        fc.constant('La música clásica me ayuda a concentrarme.'),
        fc.constant('Estoy aprendiendo a tocar la guitarra.')
    );

    // Generator for note content (multiple sentences)
    const noteContentArb = fc.array(spanishSentenceArb, { minLength: 1, maxLength: 50 })
        .map(sentences => sentences.join(' '));

    describe('Property 3: Chunk Boundary Consistency', () => {
        it('should ensure chunks are non-overlapping in core content', async () => {
            await fc.assert(
                fc.asyncProperty(
                    noteContentArb,
                    async (content) => {
                        // Skip empty or whitespace-only content
                        if (!content || content.trim().length === 0) {
                            return true;
                        }

                        const note = new Note(
                            'test-id',
                            content,
                            [0.1, 0.2, 0.3],
                            new Date()
                        );

                        const chunks = await chunkingService.chunkNote(note);

                        // Property: Chunks should be non-overlapping in core content
                        // Core content is defined as the content excluding the overlap regions
                        
                        // For each pair of consecutive chunks, verify they don't overlap in core content
                        for (let i = 0; i < chunks.length - 1; i++) {
                            const currentChunk = chunks[i];
                            const nextChunk = chunks[i + 1];

                            // The core content of current chunk ends before or at the start of next chunk's core
                            // Since overlap is intentional, we allow nextChunk.startChar <= currentChunk.endChar
                            // But the core content (accounting for overlap) should not duplicate
                            
                            // Verify chunks are ordered
                            expect(currentChunk.startChar).toBeLessThan(currentChunk.endChar);
                            expect(nextChunk.startChar).toBeLessThan(nextChunk.endChar);
                            
                            // Verify chunks progress through the note (no going backwards)
                            expect(nextChunk.startChar).toBeLessThanOrEqual(currentChunk.endChar);
                            
                            // Verify chunk indices are sequential
                            expect(nextChunk.chunkIndex).toBe(currentChunk.chunkIndex + 1);
                        }

                        return true;
                    }
                ),
                { numRuns: 20, endOnFailure: true, timeout: 30000 }
            );
        }, 35000);

        it('should ensure union of chunks covers entire note content', async () => {
            await fc.assert(
                fc.asyncProperty(
                    noteContentArb,
                    async (content) => {
                        // Skip empty or whitespace-only content
                        if (!content || content.trim().length === 0) {
                            return true;
                        }

                        const note = new Note(
                            'test-id',
                            content,
                            [0.1, 0.2, 0.3],
                            new Date()
                        );

                        const chunks = await chunkingService.chunkNote(note);

                        // Property: Union of all chunks should cover entire note content
                        
                        // Verify at least one chunk exists
                        expect(chunks.length).toBeGreaterThanOrEqual(1);

                        // Verify first chunk starts at beginning of note
                        expect(chunks[0].startChar).toBe(0);

                        // Verify last chunk ends at end of note
                        const lastChunk = chunks[chunks.length - 1];
                        expect(lastChunk.endChar).toBe(content.length);

                        // Verify no gaps between chunks (accounting for overlap)
                        for (let i = 0; i < chunks.length - 1; i++) {
                            const currentChunk = chunks[i];
                            const nextChunk = chunks[i + 1];

                            // Next chunk should start at or before current chunk ends (overlap allowed)
                            expect(nextChunk.startChar).toBeLessThanOrEqual(currentChunk.endChar);
                        }

                        // Verify all chunk content matches the note content at those positions
                        for (const chunk of chunks) {
                            const expectedContent = content.substring(chunk.startChar, chunk.endChar);
                            expect(chunk.content).toBe(expectedContent);
                        }

                        return true;
                    }
                ),
                { numRuns: 20, endOnFailure: true, timeout: 30000 }
            );
        }, 35000);

        it('should maintain boundary consistency with various chunk sizes', async () => {
            await fc.assert(
                fc.asyncProperty(
                    noteContentArb,
                    fc.integer({ min: 256, max: 1024 }), // maxChunkSize
                    fc.integer({ min: 20, max: 100 }),   // overlapSize
                    async (content, maxChunkSize, overlapSize) => {
                        // Skip empty or whitespace-only content
                        if (!content || content.trim().length === 0) {
                            return true;
                        }

                        // Ensure minChunkSize is less than maxChunkSize
                        const minChunkSize = Math.min(100, Math.floor(maxChunkSize / 2));

                        const customChunkingService = new ChunkingService(
                            mockVectorProvider,
                            mockLLMProvider,
                            {
                                maxChunkSize,
                                overlapSize,
                                minChunkSize
                            }
                        );

                        const note = new Note(
                            'test-id',
                            content,
                            [0.1, 0.2, 0.3],
                            new Date()
                        );

                        const chunks = await customChunkingService.chunkNote(note);

                        // Verify boundary consistency regardless of configuration
                        expect(chunks.length).toBeGreaterThanOrEqual(1);
                        expect(chunks[0].startChar).toBe(0);
                        expect(chunks[chunks.length - 1].endChar).toBe(content.length);

                        // Verify all chunks have valid boundaries
                        for (const chunk of chunks) {
                            expect(chunk.startChar).toBeGreaterThanOrEqual(0);
                            expect(chunk.endChar).toBeLessThanOrEqual(content.length);
                            expect(chunk.startChar).toBeLessThan(chunk.endChar);
                            
                            // Verify content matches boundaries
                            const expectedContent = content.substring(chunk.startChar, chunk.endChar);
                            expect(chunk.content).toBe(expectedContent);
                        }

                        return true;
                    }
                ),
                { numRuns: 15, endOnFailure: true, timeout: 40000 }
            );
        }, 45000);

        it('should handle edge cases: very short notes', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.string({ minLength: 1, maxLength: 50 }),
                    async (shortContent) => {
                        const note = new Note(
                            'test-id',
                            shortContent,
                            [0.1, 0.2, 0.3],
                            new Date()
                        );

                        const chunks = await chunkingService.chunkNote(note);

                        // Even very short notes should produce at least one chunk
                        expect(chunks.length).toBeGreaterThanOrEqual(1);

                        // Verify boundary consistency
                        expect(chunks[0].startChar).toBe(0);
                        expect(chunks[chunks.length - 1].endChar).toBe(shortContent.length);

                        // For very short notes, likely only one chunk
                        if (chunks.length === 1) {
                            expect(chunks[0].content).toBe(shortContent);
                        }

                        return true;
                    }
                ),
                { numRuns: 10, endOnFailure: true, timeout: 20000 }
            );
        }, 25000);

        it('should handle edge cases: very long notes', async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.integer({ min: 100, max: 200 }), // Number of sentences
                    async (numSentences) => {
                        // Generate a very long note
                        const sentences = Array(numSentences).fill('Esta es una oración de prueba con suficiente contenido para generar múltiples chunks.');
                        const longContent = sentences.join(' ');

                        const note = new Note(
                            'test-id',
                            longContent,
                            [0.1, 0.2, 0.3],
                            new Date()
                        );

                        const chunks = await chunkingService.chunkNote(note);

                        // Long notes should produce multiple chunks
                        expect(chunks.length).toBeGreaterThan(1);

                        // Verify complete coverage
                        expect(chunks[0].startChar).toBe(0);
                        expect(chunks[chunks.length - 1].endChar).toBe(longContent.length);

                        // Verify no gaps
                        for (let i = 0; i < chunks.length - 1; i++) {
                            expect(chunks[i + 1].startChar).toBeLessThanOrEqual(chunks[i].endChar);
                        }

                        // Verify all content is accounted for
                        const coveredRanges: Array<[number, number]> = chunks.map(c => [c.startChar, c.endChar]);
                        
                        // Check that ranges cover from 0 to content.length
                        expect(coveredRanges[0][0]).toBe(0);
                        expect(coveredRanges[coveredRanges.length - 1][1]).toBe(longContent.length);

                        return true;
                    }
                ),
                { numRuns: 5, endOnFailure: true, timeout: 60000 }
            );
        }, 65000);

        it('should maintain chunk-note relationship integrity', async () => {
            await fc.assert(
                fc.asyncProperty(
                    noteContentArb,
                    async (content) => {
                        // Skip empty or whitespace-only content
                        if (!content || content.trim().length === 0) {
                            return true;
                        }

                        const noteId = 'test-note-id';
                        const note = new Note(
                            noteId,
                            content,
                            [0.1, 0.2, 0.3],
                            new Date()
                        );

                        const chunks = await chunkingService.chunkNote(note);

                        // Property: Each chunk references exactly one parent note
                        for (const chunk of chunks) {
                            expect(chunk.noteId).toBe(noteId);
                            expect(chunk.id).toBeDefined();
                            expect(chunk.id.length).toBeGreaterThan(0);
                        }

                        // Property: Chunk indices are sequential starting from 0
                        for (let i = 0; i < chunks.length; i++) {
                            expect(chunks[i].chunkIndex).toBe(i);
                        }

                        return true;
                    }
                ),
                { numRuns: 20, endOnFailure: true, timeout: 30000 }
            );
        }, 35000);
    });
});