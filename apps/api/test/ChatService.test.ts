import { describe, it, expect, vi } from 'vitest';
import { Chat } from '../src/application/useCases/Chat';
import { NoteRepository } from '../src/domain/entities/NoteRepository';
import { VectorProvider } from '../src/application/providers/VectorProvider';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { GraphRepository } from '../src/domain/entities/GraphRepository';

describe('Chat', () => {
  it('should stream a response when relevant notes are found', async () => {
    // Arrange
    const mockNoteRepository = {
      findSimilar: vi.fn().mockResolvedValue([
        { id: 'note-1', content: 'Test note content' },
        { id: 'note-2', content: 'Another test note' },
      ]),
    };

    const mockGraphRepository = {
      findContextualRelationships: vi.fn().mockResolvedValue([]),
    };

    const mockRepositories = {
      get: vi.fn((key) => {
        if (key === NoteRepository) return mockNoteRepository;
        if (key === GraphRepository) return mockGraphRepository;
      })
    } as any;

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

    const chatService = new Chat(mockRepositories, mockVectorProvider, mockLlmProvider);
    const question = 'What is the test about?';
    const onSourcesFound = vi.fn();

    // Act
    const stream = chatService.askStream(question);
    let result = '';
    const events: any[] = [];
    for await (const chunk of stream) {
      events.push(chunk);
      if (chunk.type === 'token') {
        result += chunk.content;
      }
    }

    // Assert
    expect(mockVectorProvider.generateEmbedding).toHaveBeenCalledWith(question);
    expect(mockNoteRepository.findSimilar).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5, 0.5);
    expect(mockGraphRepository.findContextualRelationships).toHaveBeenCalledWith(['note-1', 'note-2']);
    
    expect(events).toContainEqual({
      type: 'meta',
      sources: [
        { id: 'note-1', content: 'Test note content' },
        { id: 'note-2', content: 'Another test note' },
      ]
    });
    
    expect(mockLlmProvider.generateStream).toHaveBeenCalled();
    expect(result).toBe('This is a test.');
    expect(events).toContainEqual({ type: 'done' });
  });

  it('should handle cases where no relevant notes are found', async () => {
    // Arrange
    const mockNoteRepository = {
      findSimilar: vi.fn().mockResolvedValue([]),
    };

    const mockGraphRepository = {
      findContextualRelationships: vi.fn().mockResolvedValue([]),
    };

    const mockRepositories = {
      get: vi.fn((key) => {
        if (key === NoteRepository) return mockNoteRepository;
        if (key === GraphRepository) return mockGraphRepository;
      })
    } as any;

    const mockVectorProvider = {
      generateEmbedding: vi.fn().mockResolvedValue([0.4, 0.5, 0.6]),
    } as unknown as VectorProvider;

    async function* mockLlmStream() {
      yield 'I have no notes on that.';
    }

    const mockLlmProvider = {
      generateStream: vi.fn().mockReturnValue(mockLlmStream()),
    } as unknown as LLMProvider;

    const chatService = new Chat(mockRepositories, mockVectorProvider, mockLlmProvider);
    const question = 'A question about something unknown';

    // Act
    const stream = chatService.askStream(question);
    let result = '';
    const events: any[] = [];
    for await (const chunk of stream) {
      events.push(chunk);
      if (chunk.type === 'token') {
        result += chunk.content;
      }
    }

    // Assert
    expect(mockNoteRepository.findSimilar).toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({ type: 'meta', sources: [] }));
    expect(mockLlmProvider.generateStream).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('No hay notas relacionadas en la base de datos.'),
        }),
      ])
    );
    expect(result).toBe('I have no notes on that.');
    expect(events).toContainEqual({ type: 'done' });
  });
});
