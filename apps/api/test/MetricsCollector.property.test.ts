import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { MetricsCollector } from '../src/infrastructure/metrics/MetricsCollector';

// Mock the database module
vi.mock('../src/infrastructure/db/index', () => ({
    db: {
        transaction: vi.fn(),
        insert: vi.fn(),
        select: vi.fn(),
        update: vi.fn(),
    },
}));

// Mock the schema module
vi.mock('../src/infrastructure/db/schema', () => ({
    agentExecutionLogs: {
        id: 'id',
        threadId: 'thread_id',
        agentType: 'agent_type',
        status: 'status',
        input: 'input',
        output: 'output',
        error: 'error',
        durationMs: 'duration_ms',
        retryCount: 'retry_count',
        startedAt: 'started_at',
        completedAt: 'completed_at',
    },
    agentMetrics: {
        id: 'id',
        agentType: 'agent_type',
        date: 'date',
        totalExecutions: 'total_executions',
        successfulExecutions: 'successful_executions',
        failedExecutions: 'failed_executions',
        avgDurationMs: 'avg_duration_ms',
        p95DurationMs: 'p95_duration_ms',
        totalRetries: 'total_retries',
        createdAt: 'created_at',
    },
}));

// Mock drizzle-orm functions
vi.mock('drizzle-orm', () => ({
    eq: vi.fn((field, value) => ({ field, value, type: 'eq' })),
    and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
    sql: vi.fn(),
}));

// Mock logger
vi.mock('../src/infrastructure/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

import { db } from '../src/infrastructure/db/index';

describe('MetricsCollector - Property-Based Tests', () => {
    let metricsCollector: MetricsCollector;
    let mockTransaction: any;
    let mockInsert: any;
    let mockSelect: any;
    let mockUpdate: any;

    beforeEach(() => {
        vi.clearAllMocks();
        metricsCollector = new MetricsCollector();

        // Setup mock chains for transaction operations
        mockInsert = {
            values: vi.fn().mockResolvedValue(undefined),
        };

        mockSelect = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([]),
        };

        mockUpdate = {
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue(undefined),
        };

        // Mock transaction context
        mockTransaction = {
            insert: vi.fn().mockReturnValue(mockInsert),
            select: vi.fn().mockReturnValue(mockSelect),
            update: vi.fn().mockReturnValue(mockUpdate),
        };

        // Setup transaction mock
        (db.transaction as any).mockImplementation(async (callback: any) => {
            return await callback(mockTransaction);
        });
    });

    describe('Property 8: Metrics Accuracy', () => {
        it('should maintain totalExecutions = successfulExecutions + failedExecutions invariant for arbitrary execution sequences', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate arbitrary agent type
                    fc.constantFrom('daily_auditor', 'routine_generator'),
                    // Generate arbitrary execution sequences
                    fc.array(
                        fc.record({
                            status: fc.constantFrom('completed' as const, 'failed' as const),
                            durationMs: fc.integer({ min: 100, max: 10000 }),
                            retryCount: fc.integer({ min: 0, max: 5 }),
                        }),
                        { minLength: 1, maxLength: 20 }
                    ),
                    async (agentType, executions) => {
                        // Reset mocks for this property test iteration
                        vi.clearAllMocks();

                        // Setup mock chains again
                        const localMockInsert = {
                            values: vi.fn().mockResolvedValue(undefined),
                        };

                        const localMockSelect = {
                            from: vi.fn().mockReturnThis(),
                            where: vi.fn().mockReturnThis(),
                            limit: vi.fn(),
                        };

                        const localMockUpdate = {
                            set: vi.fn().mockReturnThis(),
                            where: vi.fn().mockResolvedValue(undefined),
                        };

                        const localMockTransaction = {
                            insert: vi.fn().mockReturnValue(localMockInsert),
                            select: vi.fn().mockReturnValue(localMockSelect),
                            update: vi.fn().mockReturnValue(localMockUpdate),
                        };

                        (db.transaction as any).mockImplementation(async (callback: any) => {
                            return await callback(localMockTransaction);
                        });

                        // Track metrics state across executions
                        let currentMetrics: {
                            id: string;
                            agentType: string;
                            date: string;
                            totalExecutions: number;
                            successfulExecutions: number;
                            failedExecutions: number;
                            avgDurationMs: number;
                            p95DurationMs: null;
                            totalRetries: number;
                            createdAt: Date;
                        } | null = null;

                        // Execute each execution in sequence
                        for (let i = 0; i < executions.length; i++) {
                            const { status, durationMs, retryCount } = executions[i];

                            // Mock the select to return current metrics state
                            if (currentMetrics) {
                                localMockSelect.limit = vi.fn().mockResolvedValue([currentMetrics]);
                            } else {
                                localMockSelect.limit = vi.fn().mockResolvedValue([]);
                            }

                            // Execute the recordExecution
                            await metricsCollector.recordExecution(
                                `thread-${i}`,
                                agentType,
                                status,
                                durationMs,
                                retryCount,
                                { test: 'input' },
                                status === 'completed' ? { result: 'success' } : undefined,
                                status === 'failed' ? 'Error occurred' : undefined
                            );

                            // Update current metrics based on the operation
                            if (currentMetrics === null) {
                                // First execution - metrics were inserted
                                // The second insert call is for metrics (first is for execution log)
                                const allInsertCalls = localMockInsert.values.mock.calls;
                                if (allInsertCalls.length >= 2) {
                                    const insertedMetrics = allInsertCalls[1][0];
                                    currentMetrics = {
                                        id: 'metrics-id-1',
                                        agentType: insertedMetrics.agentType,
                                        date: insertedMetrics.date,
                                        totalExecutions: insertedMetrics.totalExecutions,
                                        successfulExecutions: insertedMetrics.successfulExecutions,
                                        failedExecutions: insertedMetrics.failedExecutions,
                                        avgDurationMs: insertedMetrics.avgDurationMs,
                                        p95DurationMs: null,
                                        totalRetries: insertedMetrics.totalRetries,
                                        createdAt: new Date(),
                                    };
                                }
                            } else {
                                // Subsequent execution - metrics were updated
                                const updateCall = localMockUpdate.set.mock.calls[localMockUpdate.set.mock.calls.length - 1];
                                
                                if (updateCall && currentMetrics !== null) {
                                    const updatedFields = updateCall[0];
                                    currentMetrics = {
                                        ...(currentMetrics as NonNullable<typeof currentMetrics>),
                                        totalExecutions: updatedFields.totalExecutions,
                                        successfulExecutions: updatedFields.successfulExecutions,
                                        failedExecutions: updatedFields.failedExecutions,
                                        avgDurationMs: updatedFields.avgDurationMs,
                                        totalRetries: updatedFields.totalRetries,
                                    };
                                }
                            }

                            // Verify the invariant after each execution
                            if (currentMetrics) {
                                expect(currentMetrics.totalExecutions).toBe(
                                    currentMetrics.successfulExecutions + currentMetrics.failedExecutions
                                );
                            }
                        }

                        // Final verification: count expected values
                        const expectedSuccessful = executions.filter(e => e.status === 'completed').length;
                        const expectedFailed = executions.filter(e => e.status === 'failed').length;
                        const expectedTotal = executions.length;

                        if (currentMetrics) {
                            expect(currentMetrics.totalExecutions).toBe(expectedTotal);
                            expect(currentMetrics.successfulExecutions).toBe(expectedSuccessful);
                            expect(currentMetrics.failedExecutions).toBe(expectedFailed);
                            expect(currentMetrics.totalExecutions).toBe(
                                currentMetrics.successfulExecutions + currentMetrics.failedExecutions
                            );
                        }
                    }
                ),
                { numRuns: 50 } // Run 50 different random test cases
            );
        });

        it('should maintain invariant when starting with existing metrics state', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate arbitrary agent type
                    fc.constantFrom('daily_auditor', 'routine_generator'),
                    // Generate arbitrary initial state
                    fc.record({
                        totalExecutions: fc.integer({ min: 1, max: 100 }),
                        successfulExecutions: fc.integer({ min: 0, max: 100 }),
                        failedExecutions: fc.integer({ min: 0, max: 100 }),
                        avgDurationMs: fc.integer({ min: 1000, max: 10000 }),
                        totalRetries: fc.integer({ min: 0, max: 50 }),
                    }).filter(state => 
                        // Ensure initial state satisfies the invariant
                        state.totalExecutions === state.successfulExecutions + state.failedExecutions
                    ),
                    // Generate arbitrary new execution sequences
                    fc.array(
                        fc.record({
                            status: fc.constantFrom('completed' as const, 'failed' as const),
                            durationMs: fc.integer({ min: 100, max: 10000 }),
                            retryCount: fc.integer({ min: 0, max: 5 }),
                        }),
                        { minLength: 1, maxLength: 10 }
                    ),
                    async (agentType, initialState, executions) => {
                        // Reset mocks for this property test iteration
                        vi.clearAllMocks();

                        // Setup mock chains
                        const localMockInsert = {
                            values: vi.fn().mockResolvedValue(undefined),
                        };

                        const localMockSelect = {
                            from: vi.fn().mockReturnThis(),
                            where: vi.fn().mockReturnThis(),
                            limit: vi.fn(),
                        };

                        const localMockUpdate = {
                            set: vi.fn().mockReturnThis(),
                            where: vi.fn().mockResolvedValue(undefined),
                        };

                        const localMockTransaction = {
                            insert: vi.fn().mockReturnValue(localMockInsert),
                            select: vi.fn().mockReturnValue(localMockSelect),
                            update: vi.fn().mockReturnValue(localMockUpdate),
                        };

                        (db.transaction as any).mockImplementation(async (callback: any) => {
                            return await callback(localMockTransaction);
                        });

                        // Initialize with existing metrics state
                        let currentMetrics = {
                            id: 'metrics-id-existing',
                            agentType: agentType,
                            date: new Date().toISOString().split('T')[0],
                            totalExecutions: initialState.totalExecutions,
                            successfulExecutions: initialState.successfulExecutions,
                            failedExecutions: initialState.failedExecutions,
                            avgDurationMs: initialState.avgDurationMs,
                            p95DurationMs: null,
                            totalRetries: initialState.totalRetries,
                            createdAt: new Date(),
                        };

                        // Verify initial state satisfies invariant
                        expect(currentMetrics.totalExecutions).toBe(
                            currentMetrics.successfulExecutions + currentMetrics.failedExecutions
                        );

                        // Execute each execution in sequence
                        for (let i = 0; i < executions.length; i++) {
                            const { status, durationMs, retryCount } = executions[i];

                            // Mock the select to return current metrics state
                            localMockSelect.limit = vi.fn().mockResolvedValue([currentMetrics]);

                            // Execute the recordExecution
                            await metricsCollector.recordExecution(
                                `thread-${i}`,
                                agentType,
                                status,
                                durationMs,
                                retryCount,
                                { test: 'input' },
                                status === 'completed' ? { result: 'success' } : undefined,
                                status === 'failed' ? 'Error occurred' : undefined
                            );

                            // Update current metrics based on the update operation
                            const updateCall = localMockUpdate.set.mock.calls[localMockUpdate.set.mock.calls.length - 1];
                            
                            if (updateCall && currentMetrics !== null) {
                                const updatedFields = updateCall[0];
                                currentMetrics = {
                                    ...(currentMetrics as NonNullable<typeof currentMetrics>),
                                    totalExecutions: updatedFields.totalExecutions,
                                    successfulExecutions: updatedFields.successfulExecutions,
                                    failedExecutions: updatedFields.failedExecutions,
                                    avgDurationMs: updatedFields.avgDurationMs,
                                    totalRetries: updatedFields.totalRetries,
                                };
                            }

                            // Verify the invariant after each execution
                            expect(currentMetrics.totalExecutions).toBe(
                                currentMetrics.successfulExecutions + currentMetrics.failedExecutions
                            );
                        }

                        // Final verification
                        const expectedSuccessful = initialState.successfulExecutions + 
                            executions.filter(e => e.status === 'completed').length;
                        const expectedFailed = initialState.failedExecutions + 
                            executions.filter(e => e.status === 'failed').length;
                        const expectedTotal = initialState.totalExecutions + executions.length;

                        expect(currentMetrics.totalExecutions).toBe(expectedTotal);
                        expect(currentMetrics.successfulExecutions).toBe(expectedSuccessful);
                        expect(currentMetrics.failedExecutions).toBe(expectedFailed);
                        expect(currentMetrics.totalExecutions).toBe(
                            currentMetrics.successfulExecutions + currentMetrics.failedExecutions
                        );
                    }
                ),
                { numRuns: 50 } // Run 50 different random test cases
            );
        });

        it('should maintain invariant across different agent types with mixed execution patterns', async () => {
            await fc.assert(
                fc.asyncProperty(
                    // Generate multiple agent types with their execution sequences
                    fc.array(
                        fc.record({
                            agentType: fc.constantFrom('daily_auditor', 'routine_generator'),
                            executions: fc.array(
                                fc.record({
                                    status: fc.constantFrom('completed' as const, 'failed' as const),
                                    durationMs: fc.integer({ min: 100, max: 10000 }),
                                    retryCount: fc.integer({ min: 0, max: 5 }),
                                }),
                                { minLength: 1, maxLength: 10 }
                            ),
                        }),
                        { minLength: 1, maxLength: 3 }
                    ),
                    async (agentExecutions) => {
                        // Reset mocks for this property test iteration
                        vi.clearAllMocks();

                        // Setup mock chains
                        const localMockInsert = {
                            values: vi.fn().mockResolvedValue(undefined),
                        };

                        const localMockSelect = {
                            from: vi.fn().mockReturnThis(),
                            where: vi.fn().mockReturnThis(),
                            limit: vi.fn(),
                        };

                        const localMockUpdate = {
                            set: vi.fn().mockReturnThis(),
                            where: vi.fn().mockResolvedValue(undefined),
                        };

                        const localMockTransaction = {
                            insert: vi.fn().mockReturnValue(localMockInsert),
                            select: vi.fn().mockReturnValue(localMockSelect),
                            update: vi.fn().mockReturnValue(localMockUpdate),
                        };

                        (db.transaction as any).mockImplementation(async (callback: any) => {
                            return await callback(localMockTransaction);
                        });

                        // Track metrics state per agent type
                        const metricsPerAgent: Map<string, any> = new Map();

                        // Count total executions per agent type
                        const executionCountPerAgent: Map<string, { completed: number; failed: number }> = new Map();
                        for (const { agentType, executions } of agentExecutions) {
                            const current = executionCountPerAgent.get(agentType) || { completed: 0, failed: 0 };
                            for (const exec of executions) {
                                if (exec.status === 'completed') {
                                    current.completed++;
                                } else {
                                    current.failed++;
                                }
                            }
                            executionCountPerAgent.set(agentType, current);
                        }

                        // Process each agent type's executions
                        for (const { agentType, executions } of agentExecutions) {
                            for (let i = 0; i < executions.length; i++) {
                                const { status, durationMs, retryCount } = executions[i];

                                // Get current metrics for this agent type
                                const currentMetrics = metricsPerAgent.get(agentType);

                                // Mock the select to return current metrics state
                                if (currentMetrics) {
                                    localMockSelect.limit = vi.fn().mockResolvedValue([currentMetrics]);
                                } else {
                                    localMockSelect.limit = vi.fn().mockResolvedValue([]);
                                }

                                // Execute the recordExecution
                                await metricsCollector.recordExecution(
                                    `thread-${agentType}-${i}`,
                                    agentType,
                                    status,
                                    durationMs,
                                    retryCount,
                                    { test: 'input' },
                                    status === 'completed' ? { result: 'success' } : undefined,
                                    status === 'failed' ? 'Error occurred' : undefined
                                );

                                // Update metrics state
                                if (!currentMetrics) {
                                    // First execution - metrics were inserted
                                    // Find the most recent metrics insert (second insert call in the transaction)
                                    const allInsertCalls = localMockInsert.values.mock.calls;
                                    // Look for the last insert that has agentType matching
                                    for (let j = allInsertCalls.length - 1; j >= 0; j--) {
                                        const call = allInsertCalls[j];
                                        if (call[0].agentType === agentType && call[0].totalExecutions !== undefined) {
                                            const insertedMetrics = call[0];
                                            metricsPerAgent.set(agentType, {
                                                id: `metrics-id-${agentType}`,
                                                agentType: insertedMetrics.agentType,
                                                date: insertedMetrics.date,
                                                totalExecutions: insertedMetrics.totalExecutions,
                                                successfulExecutions: insertedMetrics.successfulExecutions,
                                                failedExecutions: insertedMetrics.failedExecutions,
                                                avgDurationMs: insertedMetrics.avgDurationMs,
                                                p95DurationMs: null,
                                                totalRetries: insertedMetrics.totalRetries,
                                                createdAt: new Date(),
                                            });
                                            break;
                                        }
                                    }
                                } else {
                                    // Subsequent execution - metrics were updated
                                    const updateCall = localMockUpdate.set.mock.calls[localMockUpdate.set.mock.calls.length - 1];
                                    
                                    if (updateCall && currentMetrics !== null) {
                                        const updatedFields = updateCall[0];
                                        metricsPerAgent.set(agentType, {
                                            ...(currentMetrics as NonNullable<typeof currentMetrics>),
                                            totalExecutions: updatedFields.totalExecutions,
                                            successfulExecutions: updatedFields.successfulExecutions,
                                            failedExecutions: updatedFields.failedExecutions,
                                            avgDurationMs: updatedFields.avgDurationMs,
                                            totalRetries: updatedFields.totalRetries,
                                        });
                                    }
                                }

                                // Verify the invariant after each execution
                                const updatedMetrics = metricsPerAgent.get(agentType);
                                if (updatedMetrics) {
                                    expect(updatedMetrics.totalExecutions).toBe(
                                        updatedMetrics.successfulExecutions + updatedMetrics.failedExecutions
                                    );
                                }
                            }
                        }

                        // Final verification for each agent type
                        for (const [agentType, counts] of executionCountPerAgent.entries()) {
                            const metrics = metricsPerAgent.get(agentType);
                            if (metrics) {
                                const expectedSuccessful = counts.completed;
                                const expectedFailed = counts.failed;
                                const expectedTotal = counts.completed + counts.failed;

                                expect(metrics.totalExecutions).toBe(expectedTotal);
                                expect(metrics.successfulExecutions).toBe(expectedSuccessful);
                                expect(metrics.failedExecutions).toBe(expectedFailed);
                                expect(metrics.totalExecutions).toBe(
                                    metrics.successfulExecutions + metrics.failedExecutions
                                );
                            }
                        }
                    }
                ),
                { numRuns: 30 } // Run 30 different random test cases
            );
        });
    });
});
