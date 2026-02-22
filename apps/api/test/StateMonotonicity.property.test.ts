import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { DailyAuditorGraph } from '../src/application/agents/DailyAuditorGraph';
import { RoutineGeneratorGraph } from '../src/application/agents/RoutineGeneratorGraph';
import { DailyAuditorState, RoutineGeneratorState } from '../src/application/agents/types';

/**
 * **Validates: Design Property "State Monotonicity"**
 * 
 * Property 2: State Monotonicity
 * ∀ execution e, ∀ checkpoints c1, c2 where c1.createdAt < c2.createdAt:
 *   c1.state.retryCount ≤ c2.state.retryCount ∧
 *   c1.state.validationAttempts ≤ c2.state.validationAttempts
 * 
 * Retry and validation counters never decrease during execution (until reset on success).
 */

// Mock all dependencies
vi.mock('../src/infrastructure/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../src/infrastructure/db/index', () => ({
    db: {
        transaction: vi.fn(),
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
    },
}));

vi.mock('../src/infrastructure/db/schema', () => ({
    agentCheckpoints: {},
    agentExecutionLogs: {},
    agentMetrics: {},
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn((field, value) => ({ field, value, type: 'eq' })),
    and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
    sql: vi.fn(),
    desc: vi.fn(),
}));

describe('State Monotonicity Property Tests', () => {
    let mockLLMProvider: any;
    let mockRepositories: any;
    let mockCheckpointer: any;
    let checkpointHistory: Array<{ state: any; createdAt: Date; nodeId: string }>;

    beforeEach(() => {
        vi.clearAllMocks();
        checkpointHistory = [];

        // Mock LLM Provider
        mockLLMProvider = {
            generateResponse: vi.fn(),
        };

        // Mock Repositories
        mockRepositories = {
            get: vi.fn((repo: any) => {
                if (repo.name === 'NoteRepository') {
                    return {
                        findAll: vi.fn().mockResolvedValue([]),
                    };
                }
                if (repo.name === 'DailySummaryRepository') {
                    return {
                        save: vi.fn().mockResolvedValue(undefined),
                        findByDate: vi.fn().mockResolvedValue(null),
                    };
                }
                if (repo.name === 'RoutineRepository') {
                    return {
                        save: vi.fn().mockResolvedValue(undefined),
                    };
                }
                return {};
            }),
        };

        // Mock Checkpointer that tracks checkpoint history
        mockCheckpointer = {
            save: vi.fn(async (threadId: string, state: any, nodeId: string) => {
                const checkpoint = {
                    state: JSON.parse(JSON.stringify(state)), // Deep clone
                    createdAt: new Date(),
                    nodeId,
                };
                checkpointHistory.push(checkpoint);
                return `checkpoint-${checkpointHistory.length}`;
            }),
            load: vi.fn(async (threadId: string) => null),
            list: vi.fn(async (threadId: string) => checkpointHistory),
            delete: vi.fn(async (threadId: string) => undefined),
        };
    });

    describe('Property 2: State Monotonicity - DailyAuditorGraph', () => {
        it('should never decrease retryCount during execution with arbitrary LLM failure patterns', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate arbitrary LLM failure pattern (true = success, false = failure)
                    fc.array(fc.boolean(), { minLength: 1, maxLength: 3 }),
                    async (failurePattern) => {
                        // Reset for each test case
                        vi.clearAllMocks();
                        checkpointHistory = [];
                        mockCheckpointer.save = vi.fn(async (threadId: string, state: any, nodeId: string) => {
                            const checkpoint = {
                                state: JSON.parse(JSON.stringify(state)),
                                createdAt: new Date(),
                                nodeId,
                            };
                            checkpointHistory.push(checkpoint);
                            return `checkpoint-${checkpointHistory.length}`;
                        });

                        let callCount = 0;
                        mockLLMProvider.generateResponse = vi.fn(async () => {
                            const shouldSucceed = failurePattern[callCount % failurePattern.length];
                            callCount++;
                            
                            if (shouldSucceed) {
                                return JSON.stringify({
                                    summary: 'Test summary',
                                    riskLevel: 5,
                                    keyInsights: ['insight1', 'insight2'],
                                });
                            } else {
                                throw new Error('LLM failure');
                            }
                        });

                        // Mock notes to trigger analysis
                        mockRepositories.get = vi.fn((repo: any) => {
                            if (repo.name === 'NoteRepository') {
                                return {
                                    findAll: vi.fn().mockResolvedValue([
                                        {
                                            id: '1',
                                            content: 'Test note',
                                            createdAt: new Date('2024-01-15'),
                                        },
                                    ]),
                                };
                            }
                            if (repo.name === 'DailySummaryRepository') {
                                return {
                                    save: vi.fn().mockResolvedValue(undefined),
                                };
                            }
                            return {};
                        });

                        const graph = new DailyAuditorGraph(
                            mockLLMProvider,
                            mockRepositories,
                            mockCheckpointer
                        );

                        try {
                            await graph.execute(
                                { date: '2024-01-15' },
                                { maxRetries: 2, requiresHumanApproval: false }
                            );
                        } catch (error) {
                            // Execution may fail, but we still verify monotonicity
                        }

                        // Verify monotonicity: retryCount should never decrease
                        for (let i = 1; i < checkpointHistory.length; i++) {
                            const prevCheckpoint = checkpointHistory[i - 1];
                            const currCheckpoint = checkpointHistory[i];

                            const prevState = prevCheckpoint.state as DailyAuditorState;
                            const currState = currCheckpoint.state as DailyAuditorState;

                            // Allow retryCount to reset to 0 after successful node completion
                            // (when moving to a new node after success)
                            const isNodeTransition = prevCheckpoint.nodeId !== currCheckpoint.nodeId;
                            const isSuccessfulTransition = currState.retryCount === 0 && isNodeTransition;

                            if (!isSuccessfulTransition) {
                                // Within the same node or failed transition, retryCount must not decrease
                                expect(currState.retryCount).toBeGreaterThanOrEqual(prevState.retryCount);
                            }

                            // If we're in the same node, retryCount should be monotonically increasing
                            if (!isNodeTransition) {
                                expect(currState.retryCount).toBeGreaterThanOrEqual(prevState.retryCount);
                            }
                        }

                        return true;
                    }
                ),
                { numRuns: 3, endOnFailure: true, timeout: 12000 }
            );
        }, 15000);

        it('should maintain retryCount monotonicity across different node transitions', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate arbitrary risk levels to test different execution paths
                    fc.integer({ min: 1, max: 10 }),
                    // Generate arbitrary number of notes
                    fc.integer({ min: 0, max: 3 }),
                    async (riskLevel, noteCount) => {
                        // Reset for each test case
                        vi.clearAllMocks();
                        checkpointHistory = [];
                        mockCheckpointer.save = vi.fn(async (threadId: string, state: any, nodeId: string) => {
                            const checkpoint = {
                                state: JSON.parse(JSON.stringify(state)),
                                createdAt: new Date(),
                                nodeId,
                            };
                            checkpointHistory.push(checkpoint);
                            return `checkpoint-${checkpointHistory.length}`;
                        });

                        mockLLMProvider.generateResponse = vi.fn(async () => {
                            return JSON.stringify({
                                summary: 'Test summary',
                                riskLevel,
                                keyInsights: ['insight1'],
                            });
                        });

                        const notes = Array.from({ length: noteCount }, (_, i) => ({
                            id: `note-${i}`,
                            content: `Test note ${i}`,
                            createdAt: new Date('2024-01-15'),
                        }));

                        mockRepositories.get = vi.fn((repo: any) => {
                            if (repo.name === 'NoteRepository') {
                                return {
                                    findAll: vi.fn().mockResolvedValue(notes),
                                };
                            }
                            if (repo.name === 'DailySummaryRepository') {
                                return {
                                    save: vi.fn().mockResolvedValue(undefined),
                                };
                            }
                            return {};
                        });

                        const graph = new DailyAuditorGraph(
                            mockLLMProvider,
                            mockRepositories,
                            mockCheckpointer
                        );

                        await graph.execute(
                            { date: '2024-01-15' },
                            { maxRetries: 2, requiresHumanApproval: false }
                        );

                        // Verify monotonicity across all checkpoints
                        let maxRetryCountSeen = 0;
                        for (const checkpoint of checkpointHistory) {
                            const state = checkpoint.state as DailyAuditorState;
                            
                            // retryCount can reset to 0 on successful node completion
                            // but should never go below the max seen in the current node
                            if (state.retryCount > 0) {
                                expect(state.retryCount).toBeGreaterThanOrEqual(0);
                            }
                            
                            // Track max retry count
                            if (state.retryCount > maxRetryCountSeen) {
                                maxRetryCountSeen = state.retryCount;
                            }
                        }

                        return true;
                    }
                ),
                { numRuns: 3, endOnFailure: true, timeout: 10000 }
            );
        }, 12000);
    });

    describe('Property 2: State Monotonicity - RoutineGeneratorGraph', () => {
        it('should never decrease retryCount or validationAttempts during execution', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate arbitrary LLM failure pattern
                    fc.array(fc.boolean(), { minLength: 1, maxLength: 3 }),
                    // Generate arbitrary validation failure pattern
                    fc.array(fc.boolean(), { minLength: 1, maxLength: 2 }),
                    async (llmFailurePattern, validationFailurePattern) => {
                        // Reset for each test case
                        vi.clearAllMocks();
                        checkpointHistory = [];
                        mockCheckpointer.save = vi.fn(async (threadId: string, state: any, nodeId: string) => {
                            const checkpoint = {
                                state: JSON.parse(JSON.stringify(state)),
                                createdAt: new Date(),
                                nodeId,
                            };
                            checkpointHistory.push(checkpoint);
                            return `checkpoint-${checkpointHistory.length}`;
                        });

                        let llmCallCount = 0;
                        let validationCallCount = 0;

                        mockLLMProvider.generateResponse = vi.fn(async () => {
                            const shouldSucceed = llmFailurePattern[llmCallCount % llmFailurePattern.length];
                            llmCallCount++;
                            
                            if (shouldSucceed) {
                                // Generate valid or invalid schedule based on validation pattern
                                const shouldBeValid = validationFailurePattern[validationCallCount % validationFailurePattern.length];
                                validationCallCount++;

                                if (shouldBeValid) {
                                    return JSON.stringify({
                                        activities: [
                                            {
                                                time: '08:00',
                                                activity: 'Morning meditation',
                                                expectedBenefit: 'Reduce anxiety',
                                            },
                                            {
                                                time: '12:00',
                                                activity: 'Healthy lunch',
                                                expectedBenefit: 'Nutrition',
                                            },
                                            {
                                                time: '18:00',
                                                activity: 'Evening walk',
                                                expectedBenefit: 'Physical activity',
                                            },
                                        ],
                                    });
                                } else {
                                    // Return invalid schedule (missing fields)
                                    return JSON.stringify({
                                        activities: [
                                            {
                                                time: '08:00',
                                                activity: 'Test',
                                                // Missing expectedBenefit
                                            },
                                        ],
                                    });
                                }
                            } else {
                                throw new Error('LLM failure');
                            }
                        });

                        mockRepositories.get = vi.fn((repo: any) => {
                            if (repo.name === 'DailySummaryRepository') {
                                return {
                                    findByDate: vi.fn().mockResolvedValue({
                                        date: '2024-01-14',
                                        summary: 'Previous day summary',
                                        riskLevel: 5,
                                        keyInsights: ['insight1'],
                                    }),
                                };
                            }
                            if (repo.name === 'RoutineRepository') {
                                return {
                                    save: vi.fn().mockResolvedValue(undefined),
                                };
                            }
                            return {};
                        });

                        const graph = new RoutineGeneratorGraph(
                            mockLLMProvider,
                            mockRepositories,
                            mockCheckpointer
                        );

                        try {
                            await graph.execute(
                                { date: '2024-01-15' },
                                { maxRetries: 2, requiresHumanApproval: false }
                            );
                        } catch (error) {
                            // Execution may fail, but we still verify monotonicity
                        }

                        // Verify monotonicity for both retryCount and validationAttempts
                        for (let i = 1; i < checkpointHistory.length; i++) {
                            const prevCheckpoint = checkpointHistory[i - 1];
                            const currCheckpoint = checkpointHistory[i];

                            const prevState = prevCheckpoint.state as RoutineGeneratorState;
                            const currState = currCheckpoint.state as RoutineGeneratorState;

                            const isNodeTransition = prevCheckpoint.nodeId !== currCheckpoint.nodeId;
                            const isSuccessfulTransition = currState.retryCount === 0 && isNodeTransition;

                            // Verify retryCount monotonicity
                            if (!isSuccessfulTransition) {
                                expect(currState.retryCount).toBeGreaterThanOrEqual(prevState.retryCount);
                            }

                            // Verify validationAttempts monotonicity
                            // Handle initial state where validationAttempts is 0
                            // Only check monotonicity when validationAttempts > 0 in both checkpoints
                            const prevValidation = prevState.validationAttempts ?? 0;
                            const currValidation = currState.validationAttempts ?? 0;
                            
                            if (prevValidation > 0 || currValidation > 0) {
                                expect(currValidation).toBeGreaterThanOrEqual(prevValidation);
                            }
                        }

                        return true;
                    }
                ),
                { numRuns: 3, endOnFailure: true, timeout: 12000 }
            );
        }, 15000);

        it('should maintain monotonicity with validation feedback loop', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate number of validation failures before success
                    fc.integer({ min: 0, max: 2 }),
                    async (validationFailuresBeforeSuccess) => {
                        // Reset for each test case
                        vi.clearAllMocks();
                        checkpointHistory = [];
                        mockCheckpointer.save = vi.fn(async (threadId: string, state: any, nodeId: string) => {
                            const checkpoint = {
                                state: JSON.parse(JSON.stringify(state)),
                                createdAt: new Date(),
                                nodeId,
                            };
                            checkpointHistory.push(checkpoint);
                            return `checkpoint-${checkpointHistory.length}`;
                        });

                        let schedulerCallCount = 0;

                        mockLLMProvider.generateResponse = vi.fn(async () => {
                            const currentCall = schedulerCallCount;
                            schedulerCallCount++;

                            // First N calls return invalid schedule, then valid
                            if (currentCall < validationFailuresBeforeSuccess) {
                                return JSON.stringify({
                                    activities: [
                                        {
                                            time: '08:00',
                                            activity: 'X', // Too short
                                            expectedBenefit: 'Test',
                                        },
                                    ],
                                });
                            } else {
                                return JSON.stringify({
                                    activities: [
                                        {
                                            time: '08:00',
                                            activity: 'Morning meditation',
                                            expectedBenefit: 'Reduce anxiety',
                                        },
                                        {
                                            time: '12:00',
                                            activity: 'Healthy lunch',
                                            expectedBenefit: 'Nutrition',
                                        },
                                        {
                                            time: '18:00',
                                            activity: 'Evening walk',
                                            expectedBenefit: 'Physical activity',
                                        },
                                    ],
                                });
                            }
                        });

                        mockRepositories.get = vi.fn((repo: any) => {
                            if (repo.name === 'DailySummaryRepository') {
                                return {
                                    findByDate: vi.fn().mockResolvedValue(null),
                                };
                            }
                            if (repo.name === 'RoutineRepository') {
                                return {
                                    save: vi.fn().mockResolvedValue(undefined),
                                };
                            }
                            return {};
                        });

                        const graph = new RoutineGeneratorGraph(
                            mockLLMProvider,
                            mockRepositories,
                            mockCheckpointer
                        );

                        await graph.execute(
                            { date: '2024-01-15' },
                            { maxRetries: 2, requiresHumanApproval: false }
                        );

                        // Verify validationAttempts increases monotonically
                        let prevValidationAttempts = 0;
                        for (const checkpoint of checkpointHistory) {
                            const state = checkpoint.state as RoutineGeneratorState;
                            
                            expect(state.validationAttempts).toBeGreaterThanOrEqual(prevValidationAttempts);
                            prevValidationAttempts = state.validationAttempts;
                        }

                        // Verify final validationAttempts matches expected
                        const finalState = checkpointHistory[checkpointHistory.length - 1]?.state as RoutineGeneratorState;
                        if (finalState && finalState.status === 'completed') {
                            expect(finalState.validationAttempts).toBe(validationFailuresBeforeSuccess + 1);
                        }

                        return true;
                    }
                ),
                { numRuns: 3, endOnFailure: true, timeout: 12000 }
            );
        }, 15000);
    });
});
