import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkingService } from '../src/application/services/ChunkingService';
import { VectorProvider } from '../src/application/providers/VectorProvider';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { Note } from '../src/domain/entities/Note';

describe('ChunkingService', () => {
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

    describe('segmentBySentences', () => {
        it('should handle Spanish punctuation correctly', () => {
            const text = '¿Cómo estás? ¡Muy bien! Esto es una prueba. ¿Entiendes?';
            const segments = (chunkingService as any).segmentBySentences(text);

            expect(segments).toHaveLength(4);
            expect(segments[0].text).toContain('Cómo estás?');
            expect(segments[1].text).toContain('Muy bien!');
            expect(segments[2].text).toContain('Esto es una prueba.');
            expect(segments[3].text).toContain('Entiendes?');
        });

        it('should handle Spanish abbreviations without splitting', () => {
            const text = 'El Dr. García y la Sra. López trabajan juntos. El Prof. Martínez también.';
            const segments = (chunkingService as any).segmentBySentences(text);

            expect(segments).toHaveLength(2);
            expect(segments[0].text).toContain('García');
            expect(segments[0].text).toContain('López');
            expect(segments[1].text).toContain('Martínez');
        });

        it('should handle ellipsis correctly', () => {
            const text = 'Estaba pensando... tal vez deberíamos ir. Es una buena idea.';
            const segments = (chunkingService as any).segmentBySentences(text);

            expect(segments.length).toBeGreaterThanOrEqual(2);
            expect(segments.some((s: any) => s.text.includes('pensando'))).toBe(true);
            expect(segments.some((s: any) => s.text.includes('buena idea'))).toBe(true);
        });

        it('should handle multiple abbreviations in one sentence', () => {
            const text = 'El Dr. y la Dra. López, junto con el Ing. Pérez, etc., asistieron.';
            const segments = (chunkingService as any).segmentBySentences(text);

            expect(segments).toHaveLength(1);
            expect(segments[0].text).toContain('López');
            expect(segments[0].text).toContain('Pérez');
            expect(segments[0].text).toContain('asistieron');
        });

        it('should handle empty text', () => {
            const text = '';
            const segments = (chunkingService as any).segmentBySentences(text);

            expect(segments).toHaveLength(0);
        });

        it('should handle text without sentence endings', () => {
            const text = 'Este es un texto sin puntuación final';
            const segments = (chunkingService as any).segmentBySentences(text);

            expect(segments).toHaveLength(1);
            expect(segments[0].text).toBe(text);
        });
    });

    describe('createChunkBoundaries', () => {
        it('should respect maxChunkSize limit', () => {
            const longSentence = 'a'.repeat(400);
            const sentences = Array(6).fill(null).map((_, i) => ({
                text: longSentence,
                start: i * 400,
                end: (i + 1) * 400
            }));

            const boundaries = (chunkingService as any).createChunkBoundaries(sentences);

            boundaries.forEach((boundary: any) => {
                const chunkLength = boundary.end - boundary.start;
                const estimatedTokens = chunkLength / 4;
                expect(estimatedTokens).toBeLessThanOrEqual(512 + 50);
            });
        });

        it('should create proper overlap between chunks', () => {
            const sentence = 'a'.repeat(300);
            const sentences = Array(8).fill(null).map((_, i) => ({
                text: sentence,
                start: i * 300,
                end: (i + 1) * 300
            }));

            const boundaries = (chunkingService as any).createChunkBoundaries(sentences);

            expect(boundaries.length).toBeGreaterThan(1);

            for (let i = 0; i < boundaries.length - 1; i++) {
                const currentEnd = boundaries[i].end;
                const nextStart = boundaries[i + 1].start;
                expect(nextStart).toBeLessThanOrEqual(currentEnd);
            }
        });

        it('should handle single long sentence that exceeds chunk size', () => {
            const veryLongSentence = 'a'.repeat(3000);
            const sentences = [{ text: veryLongSentence, start: 0, end: 3000 }];

            const boundaries = (chunkingService as any).createChunkBoundaries(sentences);

            expect(boundaries).toHaveLength(1);
            expect(boundaries[0].start).toBe(0);
            expect(boundaries[0].end).toBe(3000);
        });

        it('should create at least one chunk for any input', () => {
            const shortSentence = 'Hola.';
            const sentences = [{ text: shortSentence, start: 0, end: 5 }];

            const boundaries = (chunkingService as any).createChunkBoundaries(sentences);

            expect(boundaries).toHaveLength(1);
            expect(boundaries[0].start).toBe(0);
            expect(boundaries[0].end).toBe(5);
        });

        it('should handle empty sentences array', () => {
            const sentences: Array<{ text: string; start: number; end: number }> = [];

            const boundaries = (chunkingService as any).createChunkBoundaries(sentences);

            expect(boundaries).toHaveLength(0);
        });

        it('should create sequential non-overlapping core content', () => {
            const sentence = 'a'.repeat(300);
            const sentences = Array(4).fill(null).map((_, i) => ({
                text: sentence,
                start: i * 300,
                end: (i + 1) * 300
            }));

            const boundaries = (chunkingService as any).createChunkBoundaries(sentences);

            for (let i = 0; i < boundaries.length - 1; i++) {
                expect(boundaries[i].start).toBeLessThan(boundaries[i].end);
                expect(boundaries[i].end).toBeGreaterThan(boundaries[i + 1].start);
            }
        });
    });

    describe('chunkNote', () => {
        it('should produce at least one chunk for any note', async () => {
            const note = new Note(
                'test-id',
                'Esta es una nota corta.',
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });

        it('should generate embeddings for each chunk', async () => {
            const note = new Note(
                'test-id',
                'Primera oración. Segunda oración. Tercera oración.',
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            expect(mockVectorProvider.generateEmbedding).toHaveBeenCalled();
            expect(chunks.every(chunk => chunk.embedding.length > 0)).toBe(true);
            expect(chunks.every(chunk => chunk.contextualEmbedding.length > 0)).toBe(true);
        });

        it('should assign sequential chunk indices', async () => {
            const note = new Note(
                'test-id',
                'Primera oración. Segunda oración. Tercera oración. Cuarta oración.',
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            chunks.forEach((chunk, index) => {
                expect(chunk.chunkIndex).toBe(index);
            });
        });

        it('should preserve note ID in all chunks', async () => {
            const noteId = 'test-note-id';
            const note = new Note(
                noteId,
                'Contenido de la nota con varias oraciones. Más contenido aquí.',
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            chunks.forEach(chunk => {
                expect(chunk.noteId).toBe(noteId);
            });
        });

        it('should store chunk boundaries correctly', async () => {
            const content = 'Primera oración. Segunda oración.';
            const note = new Note(
                'test-id',
                content,
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            chunks.forEach(chunk => {
                expect(chunk.startChar).toBeGreaterThanOrEqual(0);
                expect(chunk.endChar).toBeGreaterThan(chunk.startChar);
                expect(chunk.endChar).toBeLessThanOrEqual(content.length);
                
                const extractedContent = content.substring(chunk.startChar, chunk.endChar);
                expect(chunk.content).toBe(extractedContent);
            });
        });

        it('should handle long notes with multiple chunks', async () => {
            const longContent = Array(50).fill('Esta es una oración larga con suficiente contenido para generar múltiples chunks.').join(' ');
            const note = new Note(
                'test-id',
                longContent,
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            expect(chunks.length).toBeGreaterThan(1);
            
            chunks.forEach(chunk => {
                expect(chunk.id).toBeDefined();
                expect(chunk.content.length).toBeGreaterThan(0);
                expect(chunk.embedding).toBeDefined();
                expect(chunk.contextualEmbedding).toBeDefined();
            });
        });
    });

    describe('generateContextualInfo', () => {
        it('should include note summary in contextual info', async () => {
            const chunk = 'Este es el contenido del chunk.';
            const fullNote = 'Esta es una nota completa con mucho contenido. ' + chunk + ' Y más contenido después.';
            
            const contextualInfo = await (chunkingService as any).generateContextualInfo(
                chunk,
                fullNote,
                0,
                3
            );

            expect(contextualInfo).toBeDefined();
            expect(contextualInfo.length).toBeGreaterThan(0);
            expect(contextualInfo).toContain('Parte 1 de 3');
        });

        it('should indicate position for first chunk', async () => {
            const contextualInfo = await (chunkingService as any).generateContextualInfo(
                'chunk content',
                'full note content',
                0,
                3
            );

            expect(contextualInfo).toContain('inicial');
        });

        it('should indicate position for last chunk', async () => {
            const contextualInfo = await (chunkingService as any).generateContextualInfo(
                'chunk content',
                'full note content',
                2,
                3
            );

            expect(contextualInfo).toContain('final');
        });

        it('should indicate position for middle chunk', async () => {
            const contextualInfo = await (chunkingService as any).generateContextualInfo(
                'chunk content',
                'full note content',
                1,
                3
            );

            expect(contextualInfo).toContain('intermedia');
        });

        it('should cache contextual info for same note and index', async () => {
            const chunk = 'chunk content';
            const fullNote = 'full note content';
            
            const info1 = await (chunkingService as any).generateContextualInfo(chunk, fullNote, 0, 2);
            const info2 = await (chunkingService as any).generateContextualInfo(chunk, fullNote, 0, 2);

            expect(info1).toBe(info2);
        });

        it('should handle short notes without truncation', async () => {
            const shortNote = 'Esta es una nota corta.';
            
            const contextualInfo = await (chunkingService as any).generateContextualInfo(
                shortNote,
                shortNote,
                0,
                1
            );

            expect(contextualInfo).toContain(shortNote);
            expect(contextualInfo).not.toContain('...');
        });

        it('should truncate long notes in summary', async () => {
            const longNote = 'a'.repeat(300);
            
            const contextualInfo = await (chunkingService as any).generateContextualInfo(
                'chunk',
                longNote,
                0,
                1
            );

            expect(contextualInfo).toContain('...');
        });
    });

    describe('edge cases', () => {
        it('should handle note with only Spanish punctuation', async () => {
            const note = new Note(
                'test-id',
                '¿Hola? ¡Sí!',
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            expect(chunks.length).toBeGreaterThanOrEqual(1);
            expect(chunks[0].content).toContain('¿Hola?');
        });

        it('should handle note with mixed punctuation', async () => {
            const note = new Note(
                'test-id',
                'Texto normal. ¿Pregunta? ¡Exclamación! Más texto...',
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle note with no punctuation', async () => {
            const note = new Note(
                'test-id',
                'texto sin puntuacion alguna solo palabras',
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            expect(chunks.length).toBe(1);
            expect(chunks[0].content).toBe(note.content);
        });

        it('should handle note with only whitespace', async () => {
            const note = new Note(
                'test-id',
                '   ',
                [0.1, 0.2, 0.3],
                new Date()
            );

            const chunks = await chunkingService.chunkNote(note);

            expect(chunks).toBeDefined();
        });
    });
});
