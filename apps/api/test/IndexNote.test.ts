import { describe, it, expect, vi } from 'vitest';
import { IndexNote } from '../src/application/useCases/IndexNote';
import { NoteRepository } from '../src/domain/entities/NoteRepository';
import { VectorProvider } from '../src/application/providers/VectorProvider';
import { Note } from '../src/domain/entities/Note';
import { JournalAnalysisService } from '../src/domain/services/JournalAnalysisService';
import { BehaviorRepository } from '../src/domain/entities/BehaviorRepository';
import { GraphRepository } from '../src/domain/entities/GraphRepository';

describe('IndexNote Service', () => {
  it('should index a note successfully', async () => {
    // Arrange
    const mockNoteRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };

    const mockVectorProvider = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as unknown as VectorProvider;

    const mockAnalysisService = {
      analyze: vi.fn().mockResolvedValue({
        emotions: [],
        triggers: [],
        actions: [],
        relationships: [],
      }),
    } as any;

    const mockBehaviorRepository = {
      saveEmotions: vi.fn().mockResolvedValue([]),
      saveTriggers: vi.fn().mockResolvedValue([]),
      saveActions: vi.fn().mockResolvedValue([]),
    };

    const mockGraphRepository = {
      createRelationship: vi.fn().mockResolvedValue(undefined),
    };

    const mockRepositories = {
      get: vi.fn((key) => {
        if (key === NoteRepository) return mockNoteRepository;
        if (key === BehaviorRepository) return mockBehaviorRepository;
        if (key === GraphRepository) return mockGraphRepository;
      })
    } as any;

    const indexNote = new IndexNote(mockRepositories, mockVectorProvider, mockAnalysisService);
    const content = 'This is a test note.';

    // Act
    const result = await indexNote.execute(content);

    // Assert
    expect(mockVectorProvider.generateEmbedding).toHaveBeenCalledWith(content);
    expect(mockNoteRepository.save).toHaveBeenCalledWith(expect.any(Note));
    expect(mockAnalysisService.analyze).toHaveBeenCalledWith(content);
    expect(result).toBeInstanceOf(Note);
    expect(result.content).toBe(content);
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('should throw an error for content that is too short', async () => {
    // Arrange
    const mockRepositories = {} as any;
    const mockVectorProvider = {
      generateEmbedding: vi.fn(),
    } as unknown as VectorProvider;
    const mockAnalysisService = {} as any;

    const indexNote = new IndexNote(mockRepositories, mockVectorProvider, mockAnalysisService);
    const content = 'shor';

    // Act & Assert
    await expect(indexNote.execute(content)).rejects.toThrow('El contenido de la nota es demasiado corto.');
    expect(mockVectorProvider.generateEmbedding).not.toHaveBeenCalled();
  });
});
