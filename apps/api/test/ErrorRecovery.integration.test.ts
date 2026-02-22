import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DailyAuditorGraph } from '../src/application/agents/DailyAuditorGraph';
import { RoutineGeneratorGraph } from '../src/application/agents/RoutineGeneratorGraph';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { CheckpointerProvider } from '../src/application/providers/CheckpointerProvider';
import { RepositoryProvider } from '../src/infrastructure/repositories/RepositoryProvider';
import { NoteRepository } from '../src/domain/entities/NoteRepository';
import { DailySummaryRepository, DailySummary } from '../src/domain/entities/DailySummaryRepository';
import { RoutineRepository } from '../src/domain/entities/RoutineRepository';
import { Note } from '../src/domain/entities/Note';

/**
 * Error Recovery Integration Tests
 * 
 * These tests verify the complete error recovery flow works end-to-end:
 * - LLM failures trigger retry with exponential backoff
 * - Checkpoints are saved during recovery
 * - Execution eventually completes successfully after recovery
 * - State integrity is maintained across retries
 * 
 * Optimized for fast execution with maxRetries: 2
 */
describe('Error Recovery Integration Tests', () => {
    let mockLLMProvider: LLMProvider;
    let mockCheckpointer: CheckpointerProvider;
    let mockRepositories: RepositoryProvider;
    let mockNoteRepository: NoteRepository;
    let mockDailySummaryRepository: DailySummaryRepository;
    let mockRoutineRepository: RoutineRepository;
    let checkpointStore: Map<string, any>;

    beforeEach(() => {
        // Create a checkpoint store to track saves
        checkpointStore = new Map();

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
            save: vi.fn().mockResolvedValue(undefined),
            findByDate: vi.fn()
        } as unknown as DailySummaryRepository;

        // Mock Routine Repository
        mockRoutineRepository = {
            save: vi.fn().mockResolvedValue(undefined),
            findByDate: vi.fn()
        } as unknown as RoutineRepository;

        // Mock Repository Provider
        mockRepositories = {
            get: vi.fn((type) => {
                if (type === NoteRepository) return mockNoteRepository;
                if (type === DailySummaryRepository) return mockDailySummaryRepository;
                if (type === RoutineRepository) return mockRoutineRepository;
                throw new Error('Unknown repository type');
            })
        } as unknown as RepositoryProvider;

        // Mock Checkpointer with real checkpoint saves
        mockCheckpointer = {
            save: vi.fn().mockImplementation(async (threadId, state, nodeId, agentType) => {
                const checkpointId = `checkpoint-${Date.now()}`;
                checkpointStore.set(threadId, {
                    id: checkpointId,
                    threadId,
                    state: JSON.parse(JSON.stringify(state)), // Deep clone
                    nodeId,
                    agentType,
                    createdAt: new Date()
                });
                return checkpointId;
            }),
            load: vi.fn().mockImplementation(async (threadId) => {
                return checkpointStore.get(threadId) || null;
            }),
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(undefined)
        } as unknown as CheckpointerProvider;
    });

    describe('DailyAuditorGraph', () => {
        it('should recover from LLM failures and maintain checkpoint integrity', async () => {
            // Arrange: Mock LLM to fail once, then succeed
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Test note for recovery', [], new Date('2024-01-15T10:00:00Z'))
            ];

            const mockAnalysis = {
                summary: 'Success after retry',
                riskLevel: 5,
                keyInsights: ['Recovered successfully']
            };

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            
            let callCount = 0;
            vi.mocked(mockLLMProvider.generateResponse)
                .mockImplementation(async () => {
                    callCount++;
                    if (callCount === 1) {
                        throw new Error('LLM failure');
                    }
                    return JSON.stringify(mockAnalysis);
                });

            // Act: Execute graph
            const graph = new DailyAuditorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);
            const result = await graph.execute({ date: testDate }, { maxRetries: 2 });

            // Assert: Verify retries occurred
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(result.state.analysis?.summary).toBe('Success after retry');

            // Verify checkpoints were saved
            expect(mockCheckpointer.save).toHaveBeenCalled();
            const savedCheckpoints = vi.mocked(mockCheckpointer.save).mock.calls;
            expect(savedCheckpoints.length).toBeGreaterThanOrEqual(4);

            // Verify final state
            expect(result.state.retryCount).toBe(0); // Reset after success
            expect(result.state.currentNode).toBe('end');
            expect(result.state.status).toBe('completed');

            // Verify checkpoint integrity - state consistency maintained
            const finalCheckpoint = checkpointStore.get(result.threadId);
            expect(finalCheckpoint).toBeDefined();
            expect(finalCheckpoint.state.threadId).toBe(result.threadId);
            expect(finalCheckpoint.state.date).toBe(testDate);
            expect(finalCheckpoint.state.notes).toHaveLength(1);

            // Verify summary was saved
            expect(mockDailySummaryRepository.save).toHaveBeenCalledWith({
                date: testDate,
                summary: 'Success after retry',
                riskLevel: 5,
                keyInsights: ['Recovered successfully']
            });
        }, 10000);

        it('should fail after max retries exceeded', async () => {
            // Arrange: Mock LLM to always fail
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Test note', [], new Date('2024-01-15T10:00:00Z'))
            ];

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            vi.mocked(mockLLMProvider.generateResponse).mockRejectedValue(new Error('Persistent LLM failure'));

            // Act: Execute graph
            const graph = new DailyAuditorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);
            const result = await graph.execute({ date: testDate }, { maxRetries: 2 });

            // Assert: Verify execution failed
            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toContain('Failed to analyze notes after 2 retries');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);

            // Verify final state has failed status and error
            expect(result.state.status).toBe('failed');
            expect(result.state.error).toBeDefined();
            
            // Verify checkpoint was saved
            const finalCheckpoint = checkpointStore.get(result.threadId);
            expect(finalCheckpoint).toBeDefined();
        }, 10000);
    });

    describe('RoutineGeneratorGraph', () => {
        it('should recover from LLM failures', async () => {
            // Arrange: Mock LLM to fail once, then succeed
            const testDate = '2024-01-16';
            const yesterdayDate = '2024-01-15';

            const mockSummary: DailySummary = {
                id: 'summary-1',
                date: yesterdayDate,
                summary: 'Previous day summary',
                riskLevel: 5,
                keyInsights: ['Key insight 1'],
                createdAt: new Date()
            };

            const mockSchedule = {
                activities: [
                    {
                        time: '08:00',
                        activity: 'Morning meditation',
                        expectedBenefit: 'Reduce anxiety'
                    },
                    {
                        time: '12:00',
                        activity: 'Healthy lunch',
                        expectedBenefit: 'Maintain energy'
                    },
                    {
                        time: '18:00',
                        activity: 'Evening walk',
                        expectedBenefit: 'Improve mood'
                    }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(mockSummary);
            
            let callCount = 0;
            vi.mocked(mockLLMProvider.generateResponse)
                .mockImplementation(async () => {
                    callCount++;
                    if (callCount === 1) {
                        throw new Error('LLM failure');
                    }
                    return JSON.stringify(mockSchedule);
                });

            // Act: Execute graph
            const graph = new RoutineGeneratorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);
            const result = await graph.execute({ date: testDate }, { maxRetries: 2 });

            // Assert: Verify retries occurred
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(result.state.formattedRoutine?.activities).toHaveLength(3);

            // Verify checkpoints were saved
            expect(mockCheckpointer.save).toHaveBeenCalled();
            const savedCheckpoints = vi.mocked(mockCheckpointer.save).mock.calls;
            expect(savedCheckpoints.length).toBeGreaterThanOrEqual(6);

            // Verify final state
            expect(result.state.retryCount).toBe(0); // Reset after success
            expect(result.state.currentNode).toBe('end');
            expect(result.state.status).toBe('completed');

            // Verify routine was saved
            expect(mockRoutineRepository.save).toHaveBeenCalledWith({
                targetDate: testDate,
                activities: mockSchedule.activities
            });
        }, 10000);

        it('should handle JSON parsing failures', async () => {
            // Arrange: Mock LLM to return invalid JSON first, then valid
            const testDate = '2024-01-16';
            const yesterdayDate = '2024-01-15';

            const mockSummary: DailySummary = {
                id: 'summary-1',
                date: yesterdayDate,
                summary: 'Previous day summary',
                riskLevel: 5,
                keyInsights: ['Key insight 1'],
                createdAt: new Date()
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(mockSummary);
            
            let callCount = 0;
            vi.mocked(mockLLMProvider.generateResponse)
                .mockImplementation(async () => {
                    callCount++;
                    if (callCount === 1) {
                        return 'This is not valid JSON';
                    }
                    return JSON.stringify({
                        activities: [
                            {
                                time: '08:00',
                                activity: 'Morning routine',
                                expectedBenefit: 'Start day well'
                            },
                            {
                                time: '12:00',
                                activity: 'Lunch break',
                                expectedBenefit: 'Maintain energy'
                            },
                            {
                                time: '18:00',
                                activity: 'Evening relaxation',
                                expectedBenefit: 'Wind down'
                            }
                        ]
                    });
                });

            // Act: Execute graph
            const graph = new RoutineGeneratorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);
            const result = await graph.execute({ date: testDate }, { maxRetries: 2 });

            // Assert: Verify retry occurred after JSON parsing failure
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
        }, 10000);

        it('should fail after max retries exceeded', async () => {
            // Arrange: Mock LLM to always fail
            const testDate = '2024-01-16';
            const yesterdayDate = '2024-01-15';

            const mockSummary: DailySummary = {
                id: 'summary-1',
                date: yesterdayDate,
                summary: 'Previous day summary',
                riskLevel: 5,
                keyInsights: ['Key insight 1'],
                createdAt: new Date()
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(mockSummary);
            vi.mocked(mockLLMProvider.generateResponse).mockRejectedValue(new Error('Persistent LLM failure'));

            // Act: Execute graph
            const graph = new RoutineGeneratorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);
            const result = await graph.execute({ date: testDate }, { maxRetries: 2 });

            // Assert: Verify execution failed
            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toContain('Scheduler failed after 2 retries');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);

            // Verify final state has failed status
            expect(result.state.status).toBe('failed');
            expect(result.state.error).toBeDefined();
            
            // Verify checkpoint was saved
            const finalCheckpoint = checkpointStore.get(result.threadId);
            expect(finalCheckpoint).toBeDefined();
        }, 10000);
    });

    describe('Checkpoint Integrity During Recovery', () => {
        it('should maintain state consistency and preserve data across retries', async () => {
            // Arrange: Mock LLM to fail once, verify state preserved
            const testDate = '2024-01-15';
            const mockNotes = [
                new Note('1', 'Important note 1', [], new Date('2024-01-15T10:00:00Z')),
                new Note('2', 'Important note 2', [], new Date('2024-01-15T14:00:00Z'))
            ];

            vi.mocked(mockNoteRepository.findAll).mockResolvedValue(mockNotes);
            
            let callCount = 0;
            vi.mocked(mockLLMProvider.generateResponse)
                .mockImplementation(async () => {
                    callCount++;
                    if (callCount === 1) {
                        throw new Error('LLM failure');
                    }
                    return JSON.stringify({
                        summary: 'Final success',
                        riskLevel: 6,
                        keyInsights: ['Key insight']
                    });
                });

            // Act: Execute graph
            const graph = new DailyAuditorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);
            const result = await graph.execute({ date: testDate }, { maxRetries: 2 });

            // Assert: Verify state consistency maintained
            const finalCheckpoint = checkpointStore.get(result.threadId);
            expect(finalCheckpoint).toBeDefined();
            expect(finalCheckpoint.state.threadId).toBe(result.threadId);
            expect(finalCheckpoint.state.date).toBe(testDate);
            
            // Verify notes data preserved throughout retries
            expect(result.state.notes).toHaveLength(2);
            expect(result.state.notes[0].content).toBe('Important note 1');
            expect(result.state.notes[1].content).toBe('Important note 2');
            expect(finalCheckpoint.state.notes).toHaveLength(2);
            
            // Verify analysis completed successfully
            expect(finalCheckpoint.state.analysis).toBeDefined();
            expect(result.success).toBe(true);
        }, 10000);
    });
});
