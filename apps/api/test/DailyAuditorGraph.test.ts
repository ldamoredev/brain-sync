import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DailyAuditorGraph } from '../src/application/agents/DailyAuditorGraph';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { CheckpointerProvider } from '../src/application/providers/CheckpointerProvider';
import { RepositoryProvider } from '../src/infrastructure/repositories/RepositoryProvider';
import { NoteRepository } from '../src/domain/entities/NoteRepository';
import { DailySummaryRepository } from '../src/domain/entities/DailySummaryRepository';
import { Note } from '../src/domain/entities/Note';

describe('DailyAuditorGraph', () => {
    let graph: DailyAuditorGraph;
    let mockLLMProvider: LLMProvider;
    let mockCheckpointer: CheckpointerProvider;
    let mockRepositories: RepositoryProvider;
    let mockNoteRepository: NoteRepository;
    let mockDailySummaryRepository: DailySummaryRepository;

    beforeEach(() => {
        // Mock LLM Provider
        mockLLMProvider = {
            generateResponse: vi.fn(),
            generateStream: vi.fn()
        } as unknown as LLMProvider;

        // Mock Note Repository
        mockNoteRepository = {
            findAll: vi.fn(),
            save: vi.fn(),
            findById: vi.fn()
        } as unknown as NoteRepository;

        // Mock Daily Summary Repository
        mockDailySummaryRepository = {
            save: vi.fn(),
            findByDate: vi.fn()
        } as unknown as DailySummaryRepository;

        // Mock Repository Provider
        mockRepositories = {
            get: vi.fn((type) => {
                if (type === NoteRepository) return mockNoteRepository;
                if (type === DailySummaryRepository) return mockDailySummaryRepository;
                throw new Error('Unknown repository type');
            })
        } as unknown as RepositoryProvider;

        // Mock Checkpointer
        mockCheckpointer = {
            save: vi.fn().mockResolvedValue('checkpoint-id'),
            load: vi.fn().mockResolvedValue(null),
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(undefined)
        } as unknown as CheckpointerProvider;

        graph = new DailyAuditorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);
    });

    describe('fetchNotes node', () => {
        it('should fetch notes for a given date', async () => {
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Test note 1', [], new Date('2024-01-15T10:00:00Z')),
                new Note('2', 'Test note 2', [], new Date('2024-01-15T14:00:00Z')),
                new Note('3', 'Different day', [], new Date('2024-01-16T10:00:00Z'))
            ];

            const mockAnalysis = {
                summary: 'Test summary',
                riskLevel: 3,
                keyInsights: []
            };

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(mockAnalysis));
            vi.mocked(mockDailySummaryRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.state.notes).toHaveLength(2);
            expect(result.state.notes[0].content).toBe('Test note 1');
            expect(result.state.notes[1].content).toBe('Test note 2');
        }, 10000); // 10 second timeout

        it('should complete immediately if no notes found', async () => {
            const testDate = '2024-01-15';
            vi.mocked(mockNoteRepository.findAll).mockResolvedValue([]);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(result.state.notes).toHaveLength(0);
            expect(result.state.currentNode).toBe('end');
        });
    });

    describe('analyzeNotes node', () => {
        it('should analyze notes and parse JSON response', async () => {
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Feeling good today', [], new Date('2024-01-15T10:00:00Z'))
            ];

            const mockAnalysis = {
                summary: 'Día positivo',
                riskLevel: 3,
                keyInsights: ['Estado de ánimo positivo']
            };

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(mockAnalysis));
            vi.mocked(mockDailySummaryRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.state.analysis).toBeDefined();
            expect(result.state.analysis?.summary).toBe('Día positivo');
            expect(result.state.analysis?.riskLevel).toBe(3);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(1);
        });

        it('should retry on LLM failure with exponential backoff', async () => {
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Test note', [], new Date('2024-01-15T10:00:00Z'))
            ];

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse)
                .mockRejectedValueOnce(new Error('LLM error'))
                .mockRejectedValueOnce(new Error('LLM error'))
                .mockResolvedValueOnce(JSON.stringify({
                    summary: 'Success after retry',
                    riskLevel: 5,
                    keyInsights: []
                }));
            vi.mocked(mockDailySummaryRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.state.analysis?.summary).toBe('Success after retry');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(3);
        }, 10000); // 10 second timeout for exponential backoff

        it('should fail after max retries exceeded', async () => {
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Test note', [], new Date('2024-01-15T10:00:00Z'))
            ];

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse).mockRejectedValue(new Error('LLM error'));

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toContain('Failed to analyze notes after 3 retries');
        }, 10000); // 10 second timeout for exponential backoff
    });

    describe('checkApproval node', () => {
        it('should pause execution when risk level >= 7 and approval required', async () => {
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'High risk note', [], new Date('2024-01-15T10:00:00Z'))
            ];

            const mockAnalysis = {
                summary: 'Alto riesgo detectado',
                riskLevel: 8,
                keyInsights: ['Señales de alerta']
            };

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(mockAnalysis));

            const result = await graph.execute(
                { date: testDate },
                { maxRetries: 3, requiresHumanApproval: true }
            );

            expect(result.success).toBe(true);
            expect(result.status).toBe('paused');
            expect(result.state.requiresApproval).toBe(true);
            expect(result.state.currentNode).toBe('awaitingApproval');
        });

        it('should continue to save when risk level < 7', async () => {
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Low risk note', [], new Date('2024-01-15T10:00:00Z'))
            ];

            const mockAnalysis = {
                summary: 'Día normal',
                riskLevel: 4,
                keyInsights: ['Todo bien']
            };

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(mockAnalysis));
            vi.mocked(mockDailySummaryRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute(
                { date: testDate },
                { maxRetries: 3, requiresHumanApproval: true }
            );

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockDailySummaryRepository.save).toHaveBeenCalled();
        });
    });

    describe('saveSummary node', () => {
        it('should save summary to database', async () => {
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Test note', [], new Date('2024-01-15T10:00:00Z'))
            ];

            const mockAnalysis = {
                summary: 'Test summary',
                riskLevel: 5,
                keyInsights: ['Insight 1']
            };

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(mockAnalysis));
            vi.mocked(mockDailySummaryRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockDailySummaryRepository.save).toHaveBeenCalledWith({
                date: testDate,
                summary: 'Test summary',
                riskLevel: 5,
                keyInsights: ['Insight 1']
            });
        });
    });

    describe('resume functionality', () => {
        it('should resume paused execution with approval', async () => {
            const testDate = '2024-01-15';
            const threadId = 'test-thread-id';
            
            const pausedState = {
                threadId,
                status: 'paused' as const,
                currentNode: 'awaitingApproval',
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: testDate,
                notes: [{ id: '1', content: 'Test', createdAt: new Date() }],
                analysis: {
                    summary: 'High risk',
                    riskLevel: 8,
                    keyInsights: []
                },
                requiresApproval: true,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state: pausedState,
                nodeId: 'awaitingApproval',
                createdAt: new Date()
            });
            vi.mocked(mockDailySummaryRepository.save).mockResolvedValue(undefined);

            const result = await graph.resume(threadId, { approved: true });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockDailySummaryRepository.save).toHaveBeenCalled();
        });

        it('should complete without saving when approval denied', async () => {
            const testDate = '2024-01-15';
            const threadId = 'test-thread-id';
            
            const pausedState = {
                threadId,
                status: 'paused' as const,
                currentNode: 'awaitingApproval',
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: testDate,
                notes: [{ id: '1', content: 'Test', createdAt: new Date() }],
                analysis: {
                    summary: 'High risk',
                    riskLevel: 8,
                    keyInsights: []
                },
                requiresApproval: true,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state: pausedState,
                nodeId: 'awaitingApproval',
                createdAt: new Date()
            });

            const result = await graph.resume(threadId, { approved: false });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockDailySummaryRepository.save).not.toHaveBeenCalled();
        });
    });

    describe('checkpoint management', () => {
        it('should save checkpoint after each node transition', async () => {
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Test note', [], new Date('2024-01-15T10:00:00Z'))
            ];

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify({
                summary: 'Test',
                riskLevel: 3,
                keyInsights: []
            }));
            vi.mocked(mockDailySummaryRepository.save).mockResolvedValue(undefined);

            await graph.execute({ date: testDate }, { maxRetries: 3 });

            // Should save checkpoint after: fetchNotes, analyzeNotes, checkApproval, saveSummary
            expect(mockCheckpointer.save).toHaveBeenCalled();
            expect(vi.mocked(mockCheckpointer.save).mock.calls.length).toBeGreaterThan(0);
        });
    });
});
