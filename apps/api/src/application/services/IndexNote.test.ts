import { describe, it, expect, vi } from 'vitest';
import { IndexNote } from './IndexNote';
import { DrizzleNoteRepository } from '../../infrastructure/repositories/DrizzleNoteRepository';
import { VectorProvider } from '../providers/VectorProvider';
import { Note } from '../../domain/entities/Note';

// Mock the dependencies
vi.mock('../../infrastructure/repositories/DrizzleNoteRepository');
vi.mock('../providers/VectorProvider');

describe('IndexNote Service', () => {
  it('should index a note successfully', async () => {
    // Arrange
    const mockNoteRepository = new DrizzleNoteRepository();
    const mockVectorProvider = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as unknown as VectorProvider;

    const indexNote = new IndexNote(mockNoteRepository, mockVectorProvider);
    const content = 'This is a test note.';

    // Act
    const result = await indexNote.execute(content);

    // Assert
    expect(mockVectorProvider.generateEmbedding).toHaveBeenCalledWith(content);
    expect(mockNoteRepository.save).toHaveBeenCalledWith(expect.any(Note));
    expect(result).toBeInstanceOf(Note);
    expect(result.content).toBe(content);
    expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('should throw an error for content that is too short', async () => {
    // Arrange
    const mockNoteRepository = new DrizzleNoteRepository();
    const mockVectorProvider = {
      generateEmbedding: vi.fn(),
    } as unknown as VectorProvider;

    const indexNote = new IndexNote(mockNoteRepository, mockVectorProvider);
    const content = 'shor'; // Use content with length < 5 to trigger the error

    // Act & Assert
    await expect(indexNote.execute(content)).rejects.toThrow('El contenido de la nota es demasiado corto.');
    expect(mockVectorProvider.generateEmbedding).not.toHaveBeenCalled();
    expect(mockNoteRepository.save).not.toHaveBeenCalled();
  });
});
