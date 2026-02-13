import { describe, it, expect, vi } from 'vitest';
import { Chat } from '../src/application/useCases/chat/Chat';
import { NoteRepository } from '../src/domain/entities/NoteRepository';
import { VectorProvider } from '../src/application/providers/VectorProvider';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { GraphRepository } from '../src/domain/entities/GraphRepository';

describe('Chat', () => {
  it('should stream a response when relevant notes are found', async () => {
    // Arrange
    const mockPipeline = {
      executeStream: vi.fn(async function* (ctx) {
        ctx.notes = [
          { id: 'note-1', content: 'Test note content' },
          { id: 'note-2', content: 'Another test note' },
        ];
        yield { type: 'meta', sources: ctx.notes };
        yield { type: 'token', content: 'This is a test.' };
        yield { type: 'done' };
      })
    } as any;

    const chatService = new Chat(mockPipeline);
    const question = 'What is the test about?';

    // Act
    const stream = chatService.executeStream(question);
    let result = '';
    const events: any[] = [];
    for await (const chunk of stream) {
      events.push(chunk);
      if (chunk.type === 'token') {
        result += chunk.content;
      }
    }

    // Assert
    expect(mockPipeline.executeStream).toHaveBeenCalled();
    
    expect(events).toContainEqual({
      type: 'meta',
      sources: [
        { id: 'note-1', content: 'Test note content' },
        { id: 'note-2', content: 'Another test note' },
      ]
    });
    
    expect(result).toBe('This is a test.');
    expect(events).toContainEqual({ type: 'done' });
  });

  it('should handle cases where no relevant notes are found', async () => {
    // Arrange
    const mockPipeline = {
      executeStream: vi.fn(async function* (ctx) {
        ctx.notes = [];
        yield { type: 'meta', sources: [] };
        yield { type: 'token', content: 'I have no notes on that.' };
        yield { type: 'done' };
      })
    } as any;

    const chatService = new Chat(mockPipeline);
    const question = 'A question about something unknown';

    // Act
    const stream = chatService.executeStream(question);
    let result = '';
    const events: any[] = [];
    for await (const chunk of stream) {
      events.push(chunk);
      if (chunk.type === 'token') {
        result += chunk.content;
      }
    }

    // Assert
    expect(mockPipeline.executeStream).toHaveBeenCalled();
    expect(events).toContainEqual(expect.objectContaining({ type: 'meta', sources: [] }));
    
    expect(result).toBe('I have no notes on that.');
    expect(events).toContainEqual({ type: 'done' });
  });
});
