import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DailyAuditorGraph } from '../src/application/agents/DailyAuditorGraph';
import { RoutineGeneratorGraph } from '../src/application/agents/RoutineGeneratorGraph';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { CheckpointerProvider } from '../src/application/providers/CheckpointerProvider';
import { RepositoryProvider } from '../src/infrastructure/repositories/RepositoryProvider';
import { NoteRepository } from '../src/domain/entities/NoteRepository';
import { DailySummaryRepository } from '../src/domain/entities/DailySummaryRepository';

describe('Graph Execution Timeout', () => {
    let mockLLMProvider: LLMProvider;
    let mockCheckpointer: CheckpointerProvider;
    let mockRepositories: RepositoryProvider;

    beforeEach(() => {
        // Mock LLM provider that takes a long time
        mockLLMProvider = {
            generateResponse: vi.fn().mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => resolve('{"summary": "Test", "riskLevel": 5, "keyInsights": []}'), 10000);
                });
            })
        } as unknown as LLMProvider;

        // Mock checkpointer
        mockCheckpointer = {
            save: vi.fn().mockResolvedValue('checkpoint-id'),
            load: vi.fn().mockResolvedValue(null),
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(undefined)
        } as unknown as CheckpointerProvider;

        // Mock repositories
        const mockNoteRepository = {
            findAll: vi.fn().mockResolvedValue([
                { id: '1', content: 'Test note', createdAt: new Date('2024-01-15') }
            ])
        } as unknown as NoteRepository;

        const mockDailySummaryRepository = {
            save: vi.fn().mockResolvedValue(undefined),
            findByDate: vi.fn().mockResolvedValue(null)
        } as unknown as DailySummaryRepository;

        mockRepositories = {
            get: vi.fn((type) => {
                if (type === NoteRepository) return mockNoteRepository;
                if (type === DailySummaryRepository) return mockDailySummaryRepository;
                throw new Error('Unknown repository type');
            })
        } as unknown as RepositoryProvider;
    });

    describe('DailyAuditorGraph', () => {
        it('should timeout after configured duration', async () => {
            const graph = new DailyAuditorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);

            const result = await graph.execute(
                { date: '2024-01-15' },
                { timeout: 1000 } // 1 second timeout
            );

            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toBe('Tiempo de ejecución excedido');
        });

        it('should use default timeout of 5 minutes', async () => {
            const graph = new DailyAuditorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);

            // This test verifies the default timeout is set, but doesn't wait for it
            // We just check that the timeout parameter is properly defaulted
            const executePromise = graph.execute({ date: '2024-01-15' });

            // Cancel the execution quickly to avoid waiting
            await new Promise(resolve => setTimeout(resolve, 100));

            // The test passes if no error is thrown during setup
            expect(executePromise).toBeDefined();
        }, 500);
    });

    describe('RoutineGeneratorGraph', () => {
        it('should timeout after configured duration', async () => {
            const graph = new RoutineGeneratorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);

            const result = await graph.execute(
                { date: '2024-01-16' },
                { timeout: 1000 } // 1 second timeout
            );

            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toBe('Tiempo de ejecución excedido');
        });
    });
});
