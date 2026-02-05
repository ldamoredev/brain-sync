import { describe, it, expect, vi } from 'vitest';
import { ChatService } from './ChatService';
import { DrizzleNoteRepository } from '../../infrastructure/repositories/DrizzleNoteRepository';
import { VectorProvider } from '../providers/VectorProvider';
import { LLMProvider } from '../providers/LLMProvider';

// Mock the dependencies
vi.mock('../../infrastructure/repositories/DrizzleNoteRepository');
vi.mock('../providers/VectorProvider');
vi.mock('../providers/LLMProvider');

describe('ChatService', () => {
  it('should stream a response when relevant notes are found', async () => {
    // Arrange
    const mockNoteRepository = new DrizzleNoteRepository();
    const mockVectorProvider = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    } as unknown as VectorProvider;

    async function* mockLlmStream() {
      yield 'This';
      yield ' is';
      yield ' a';
      yield ' test.';
    }

    const mockLlmProvider = {
      generateStream: vi.fn().mockReturnValue(mockLlmStream()),
    } as unknown as LLMProvider;

    const mockNotes = [
      { id: 'note-1', content: 'Test note content' },
      { id: 'note-2', content: 'Another test note' },
    ];
    mockNoteRepository.findSimilar = vi.fn().mockResolvedValue(mockNotes);

    const chatService = new ChatService(mockNoteRepository, mockVectorProvider, mockLlmProvider);
    const question = 'What is the test about?';
    const onSourcesFound = vi.fn();

    // Act
    const stream = chatService.askStream(question, onSourcesFound);
    let result = '';
    for await (const chunk of stream) {
      result += chunk;
    }

    // Assert
    expect(mockVectorProvider.generateEmbedding).toHaveBeenCalledWith(question);
    expect(mockNoteRepository.findSimilar).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5);
    expect(onSourcesFound).toHaveBeenCalledWith(mockNotes.map(n => ({ id: n.id, content: n.content })));
    expect(mockLlmProvider.generateStream).toHaveBeenCalled();
    expect(result).toBe('This is a test.');
  });

  it('should handle cases where no relevant notes are found', async () => {
    // Arrange
    const mockNoteRepository = new DrizzleNoteRepository();
    mockNoteRepository.findSimilar = vi.fn().mockResolvedValue([]); // No notes found

    const mockVectorProvider = {
      generateEmbedding: vi.fn().mockResolvedValue([0.4, 0.5, 0.6]),
    } as unknown as VectorProvider;

    async function* mockLlmStream() {
      yield 'I have no notes on that.';
    }

    const mockLlmProvider = {
      generateStream: vi.fn().mockReturnValue(mockLlmStream()),
    } as unknown as LLMProvider;

    const chatService = new ChatService(mockNoteRepository, mockVectorProvider, mockLlmProvider);
    const question = 'A question about something unknown';
    const onSourcesFound = vi.fn();

    // Act
    const stream = chatService.askStream(question, onSourcesFound);
    let result = '';
    for await (const chunk of stream) {
      result += chunk;
    }

    // Assert
    expect(mockNoteRepository.findSimilar).toHaveBeenCalled();
    expect(onSourcesFound).toHaveBeenCalledWith([]);
    expect(mockLlmProvider.generateStream).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('No hay notas relacionadas en la base de datos.'),
        }),
      ])
    );
    expect(result).toBe('I have no notes on that.');
  });
});
