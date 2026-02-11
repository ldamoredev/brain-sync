import { describe, it, expect, vi } from 'vitest';
import { IndexNote } from '../application/services/IndexNote';
import { DrizzleNoteRepository } from '../infrastructure/repositories/DrizzleNoteRepository';
import { VectorProvider } from '../application/providers/VectorProvider';
import { Note } from '../domain/entities/Note';
import { JournalAnalysisService } from '../application/services/JournalAnalysisService';
import { DrizzleBehaviorRepository } from '../infrastructure/repositories/DrizzleBehaviorRepository';
import { DrizzleGraphRepository } from '../infrastructure/repositories/DrizzleGraphRepository';

// Mock the dependencies
vi.mock('../../infrastructure/repositories/DrizzleNoteRepository');
vi.mock('../providers/VectorProvider');
vi.mock('../application/services/JournalAnalysisService');
vi.mock('../../infrastructure/repositories/DrizzleBehaviorRepository');
vi.mock('../../infrastructure/repositories/DrizzleGraphRepository');

describe('IndexNote Service', () => {
  it('should index a note successfully', async () => {
    // Arrange
    // Create a mock instance with explicit spies
    const mockNoteRepository = new DrizzleNoteRepository() as any;
    mockNoteRepository.save = vi.fn().mockResolvedValue(undefined);

    const mockVectorProvider = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as unknown as VectorProvider;

    const mockAnalysisService = new JournalAnalysisService(vi.fn() as any);
    mockAnalysisService.analyze = vi.fn().mockResolvedValue({
        emotions: [],
        triggers: [],
        actions: [],
        relationships: [],
    });

    const mockBehaviorRepository = new DrizzleBehaviorRepository() as any;
    mockBehaviorRepository.saveEmotions = vi.fn().mockResolvedValue([]);
    mockBehaviorRepository.saveTriggers = vi.fn().mockResolvedValue([]);
    mockBehaviorRepository.saveActions = vi.fn().mockResolvedValue([]);

    const mockGraphRepository = new DrizzleGraphRepository() as any;
    mockGraphRepository.createRelationship = vi.fn().mockResolvedValue(undefined);

    const indexNote = new IndexNote(mockNoteRepository, mockVectorProvider, mockAnalysisService, mockBehaviorRepository, mockGraphRepository);
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
    const mockNoteRepository = new DrizzleNoteRepository() as any;
    mockNoteRepository.save = vi.fn(); // Explicit spy

    const mockVectorProvider = {
      generateEmbedding: vi.fn(),
    } as unknown as VectorProvider;
    
    const mockAnalysisService = new JournalAnalysisService(vi.fn() as any);
    const mockBehaviorRepository = new DrizzleBehaviorRepository() as any;
    const mockGraphRepository = new DrizzleGraphRepository() as any;

    const indexNote = new IndexNote(mockNoteRepository, mockVectorProvider, mockAnalysisService, mockBehaviorRepository, mockGraphRepository);
    const content = 'shor'; // Use content with length < 5 to trigger the error

    // Act & Assert
    await expect(indexNote.execute(content)).rejects.toThrow('El contenido de la nota es demasiado corto.');
    expect(mockVectorProvider.generateEmbedding).not.toHaveBeenCalled();
    expect(mockNoteRepository.save).not.toHaveBeenCalled();
  });
});
