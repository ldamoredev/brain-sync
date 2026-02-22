import { describe, it, expect, vi, beforeEach } from 'vitest';
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
import logger from '../src/infrastructure/logger';

describe('MetricsCollector', () => {
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

    describe('recordExecution() - Execution Log Creation', () => {
        it('should create execution log with all fields', async () => {
            // Arrange
            const threadId = 'test-thread-123';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };
            const output = { summary: 'Test summary', riskLevel: 3 };

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                output
            );

            // Assert
            expect(db.transaction).toHaveBeenCalledTimes(1);
            expect(mockTransaction.insert).toHaveBeenCalled();
            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    threadId: 'test-thread-123',
                    agentType: 'daily_auditor',
                    status: 'completed',
                    input: { date: '2024-01-15' },
                    output: { summary: 'Test summary', riskLevel: 3 },
                    error: null,
                    durationMs: 5000,
                    retryCount: 0,
                    startedAt: expect.any(Date),
                    completedAt: expect.any(Date),
                })
            );
        });

        it('should create execution log with error for failed status', async () => {
            // Arrange
            const threadId = 'test-thread-456';
            const agentType = 'routine_generator';
            const status = 'failed';
            const durationMs = 3000;
            const retryCount = 2;
            const input = { targetDate: '2024-01-16' };
            const error = 'LLM API timeout';

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                undefined,
                error
            );

            // Assert
            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    threadId: 'test-thread-456',
                    agentType: 'routine_generator',
                    status: 'failed',
                    input: { targetDate: '2024-01-16' },
                    output: null,
                    error: 'LLM API timeout',
                    durationMs: 3000,
                    retryCount: 2,
                })
            );
        });

        it('should calculate startedAt correctly from durationMs', async () => {
            // Arrange
            const threadId = 'test-thread-789';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 10000; // 10 seconds
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            const beforeExecution = Date.now();

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockInsert.values.mock.calls[0][0];
            const startedAt = callArgs.startedAt.getTime();
            const completedAt = callArgs.completedAt.getTime();
            const actualDuration = completedAt - startedAt;

            // Duration should be approximately 10000ms (allowing for small timing differences)
            expect(actualDuration).toBeGreaterThanOrEqual(9900);
            expect(actualDuration).toBeLessThanOrEqual(10100);
            expect(completedAt).toBeGreaterThanOrEqual(beforeExecution);
        });
    });

    describe('recordExecution() - Daily Metrics Creation (First Execution)', () => {
        it('should create new daily metrics for first completed execution', async () => {
            // Arrange
            const threadId = 'test-thread-001';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 1;
            const input = { date: '2024-01-15' };

            // Mock: no existing metrics
            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            expect(mockTransaction.select).toHaveBeenCalled();
            expect(mockTransaction.insert).toHaveBeenCalledTimes(2); // execution log + metrics
            
            const metricsInsertCall = mockTransaction.insert.mock.calls[1];
            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentType: 'daily_auditor',
                    date: expect.any(String),
                    totalExecutions: 1,
                    successfulExecutions: 1,
                    failedExecutions: 0,
                    avgDurationMs: 5000,
                    p95DurationMs: null,
                    totalRetries: 1,
                })
            );
        });

        it('should create new daily metrics for first failed execution', async () => {
            // Arrange
            const threadId = 'test-thread-002';
            const agentType = 'routine_generator';
            const status = 'failed';
            const durationMs = 2000;
            const retryCount = 3;
            const input = { targetDate: '2024-01-16' };
            const error = 'Database connection failed';

            // Mock: no existing metrics
            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                undefined,
                error
            );

            // Assert
            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    agentType: 'routine_generator',
                    totalExecutions: 1,
                    successfulExecutions: 0,
                    failedExecutions: 1,
                    avgDurationMs: 2000,
                    totalRetries: 3,
                })
            );
        });

        it('should use current date in YYYY-MM-DD format for metrics', async () => {
            // Arrange
            const threadId = 'test-thread-003';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 1000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            // Mock: no existing metrics
            mockSelect.limit = vi.fn().mockResolvedValue([]);

            const today = new Date().toISOString().split('T')[0];

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            expect(mockInsert.values).toHaveBeenCalledWith(
                expect.objectContaining({
                    date: today,
                })
            );
        });
    });

    describe('recordExecution() - Daily Metrics Update (Subsequent Executions)', () => {
        it('should update existing daily metrics for completed execution', async () => {
            // Arrange
            const threadId = 'test-thread-004';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 6000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            // Mock: existing metrics
            const existingMetrics = {
                id: 'metrics-id-123',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 5,
                successfulExecutions: 4,
                failedExecutions: 1,
                avgDurationMs: 5000,
                p95DurationMs: null,
                totalRetries: 2,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            expect(mockTransaction.update).toHaveBeenCalled();
            expect(mockUpdate.set).toHaveBeenCalledWith({
                totalExecutions: 6,
                successfulExecutions: 5,
                failedExecutions: 1,
                avgDurationMs: 5167, // (5000 * 5 + 6000) / 6 = 5166.67 rounded to 5167
                totalRetries: 2,
            });
            expect(mockUpdate.where).toHaveBeenCalled();
        });

        it('should update existing daily metrics for failed execution', async () => {
            // Arrange
            const threadId = 'test-thread-005';
            const agentType = 'routine_generator';
            const status = 'failed';
            const durationMs = 3000;
            const retryCount = 2;
            const input = { targetDate: '2024-01-16' };
            const error = 'Validation failed';

            // Mock: existing metrics
            const existingMetrics = {
                id: 'metrics-id-456',
                agentType: 'routine_generator',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 10,
                successfulExecutions: 8,
                failedExecutions: 2,
                avgDurationMs: 4000,
                p95DurationMs: null,
                totalRetries: 5,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                undefined,
                error
            );

            // Assert
            expect(mockUpdate.set).toHaveBeenCalledWith({
                totalExecutions: 11,
                successfulExecutions: 8,
                failedExecutions: 3,
                avgDurationMs: 3909, // (4000 * 10 + 3000) / 11 = 3909.09 rounded to 3909
                totalRetries: 7,
            });
        });

        it('should handle null values in existing metrics gracefully', async () => {
            // Arrange
            const threadId = 'test-thread-006';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 1;
            const input = { date: '2024-01-15' };

            // Mock: existing metrics with null values
            const existingMetrics = {
                id: 'metrics-id-789',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: null,
                successfulExecutions: null,
                failedExecutions: null,
                avgDurationMs: null,
                p95DurationMs: null,
                totalRetries: null,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            expect(mockUpdate.set).toHaveBeenCalledWith({
                totalExecutions: 1,
                successfulExecutions: 1,
                failedExecutions: 0,
                avgDurationMs: 5000,
                totalRetries: 1,
            });
        });
    });

    describe('recordExecution() - Invariant: totalExecutions = successfulExecutions + failedExecutions', () => {
        it('should maintain invariant for new metrics with completed status', async () => {
            // Arrange
            const threadId = 'test-thread-007';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockInsert.values.mock.calls[1][0];
            expect(callArgs.totalExecutions).toBe(
                callArgs.successfulExecutions + callArgs.failedExecutions
            );
            expect(callArgs.totalExecutions).toBe(1);
            expect(callArgs.successfulExecutions).toBe(1);
            expect(callArgs.failedExecutions).toBe(0);
        });

        it('should maintain invariant for new metrics with failed status', async () => {
            // Arrange
            const threadId = 'test-thread-008';
            const agentType = 'routine_generator';
            const status = 'failed';
            const durationMs = 2000;
            const retryCount = 3;
            const input = { targetDate: '2024-01-16' };
            const error = 'Error occurred';

            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                undefined,
                error
            );

            // Assert
            const callArgs = mockInsert.values.mock.calls[1][0];
            expect(callArgs.totalExecutions).toBe(
                callArgs.successfulExecutions + callArgs.failedExecutions
            );
            expect(callArgs.totalExecutions).toBe(1);
            expect(callArgs.successfulExecutions).toBe(0);
            expect(callArgs.failedExecutions).toBe(1);
        });

        it('should maintain invariant when updating metrics with completed status', async () => {
            // Arrange
            const threadId = 'test-thread-009';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            const existingMetrics = {
                id: 'metrics-id-abc',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 10,
                successfulExecutions: 7,
                failedExecutions: 3,
                avgDurationMs: 4500,
                p95DurationMs: null,
                totalRetries: 5,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            expect(callArgs.totalExecutions).toBe(
                callArgs.successfulExecutions + callArgs.failedExecutions
            );
            expect(callArgs.totalExecutions).toBe(11);
            expect(callArgs.successfulExecutions).toBe(8);
            expect(callArgs.failedExecutions).toBe(3);
        });

        it('should maintain invariant when updating metrics with failed status', async () => {
            // Arrange
            const threadId = 'test-thread-010';
            const agentType = 'routine_generator';
            const status = 'failed';
            const durationMs = 3000;
            const retryCount = 2;
            const input = { targetDate: '2024-01-16' };
            const error = 'Timeout error';

            const existingMetrics = {
                id: 'metrics-id-def',
                agentType: 'routine_generator',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 20,
                successfulExecutions: 18,
                failedExecutions: 2,
                avgDurationMs: 5000,
                p95DurationMs: null,
                totalRetries: 3,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                undefined,
                error
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            expect(callArgs.totalExecutions).toBe(
                callArgs.successfulExecutions + callArgs.failedExecutions
            );
            expect(callArgs.totalExecutions).toBe(21);
            expect(callArgs.successfulExecutions).toBe(18);
            expect(callArgs.failedExecutions).toBe(3);
        });

        it('should maintain invariant across multiple sequential executions', async () => {
            // Arrange
            const agentType = 'daily_auditor';
            const input = { date: '2024-01-15' };

            let currentMetrics = {
                id: 'metrics-id-ghi',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 0,
                successfulExecutions: 0,
                failedExecutions: 0,
                avgDurationMs: 0,
                p95DurationMs: null,
                totalRetries: 0,
                createdAt: new Date(),
            };

            // Simulate 5 executions: 3 completed, 2 failed
            const executions = [
                { status: 'completed' as const, durationMs: 5000 },
                { status: 'completed' as const, durationMs: 6000 },
                { status: 'failed' as const, durationMs: 3000 },
                { status: 'completed' as const, durationMs: 5500 },
                { status: 'failed' as const, durationMs: 2000 },
            ];

            for (let i = 0; i < executions.length; i++) {
                const { status, durationMs } = executions[i];
                
                mockSelect.limit = vi.fn().mockResolvedValue([currentMetrics]);

                await metricsCollector.recordExecution(
                    `test-thread-${i}`,
                    agentType,
                    status,
                    durationMs,
                    0,
                    input,
                    status === 'completed' ? { result: 'success' } : undefined,
                    status === 'failed' ? 'Error' : undefined
                );

                // Update current metrics based on the call
                const callArgs = mockUpdate.set.mock.calls[i][0];
                currentMetrics = {
                    ...currentMetrics,
                    ...callArgs,
                };

                // Verify invariant after each execution
                expect(currentMetrics.totalExecutions).toBe(
                    currentMetrics.successfulExecutions + currentMetrics.failedExecutions
                );
            }

            // Final verification
            expect(currentMetrics.totalExecutions).toBe(5);
            expect(currentMetrics.successfulExecutions).toBe(3);
            expect(currentMetrics.failedExecutions).toBe(2);
        });
    });

    describe('recordExecution() - avgDurationMs Rolling Average Calculation', () => {
        it('should set avgDurationMs to durationMs for first execution', async () => {
            // Arrange
            const threadId = 'test-thread-011';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockInsert.values.mock.calls[1][0];
            expect(callArgs.avgDurationMs).toBe(5000);
        });

        it('should calculate rolling average correctly for second execution', async () => {
            // Arrange
            const threadId = 'test-thread-012';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 7000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            const existingMetrics = {
                id: 'metrics-id-jkl',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 1,
                successfulExecutions: 1,
                failedExecutions: 0,
                avgDurationMs: 5000,
                p95DurationMs: null,
                totalRetries: 0,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            // (5000 * 1 + 7000) / 2 = 6000
            expect(callArgs.avgDurationMs).toBe(6000);
        });

        it('should calculate rolling average correctly over multiple executions', async () => {
            // Arrange
            const threadId = 'test-thread-013';
            const agentType = 'routine_generator';
            const status = 'completed';
            const durationMs = 8000;
            const retryCount = 0;
            const input = { targetDate: '2024-01-16' };

            const existingMetrics = {
                id: 'metrics-id-mno',
                agentType: 'routine_generator',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 4,
                successfulExecutions: 3,
                failedExecutions: 1,
                avgDurationMs: 5000, // Average of previous 4 executions
                p95DurationMs: null,
                totalRetries: 1,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            // (5000 * 4 + 8000) / 5 = 28000 / 5 = 5600
            expect(callArgs.avgDurationMs).toBe(5600);
        });

        it('should round avgDurationMs to nearest integer', async () => {
            // Arrange
            const threadId = 'test-thread-014';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5500;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            const existingMetrics = {
                id: 'metrics-id-pqr',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 2,
                successfulExecutions: 2,
                failedExecutions: 0,
                avgDurationMs: 5000,
                p95DurationMs: null,
                totalRetries: 0,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            // (5000 * 2 + 5500) / 3 = 15500 / 3 = 5166.67 rounded to 5167
            expect(callArgs.avgDurationMs).toBe(5167);
        });

        it('should include both completed and failed executions in average calculation', async () => {
            // Arrange
            const threadId = 'test-thread-015';
            const agentType = 'daily_auditor';
            const status = 'failed';
            const durationMs = 2000;
            const retryCount = 3;
            const input = { date: '2024-01-15' };
            const error = 'Execution failed';

            const existingMetrics = {
                id: 'metrics-id-stu',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 3,
                successfulExecutions: 2,
                failedExecutions: 1,
                avgDurationMs: 6000, // Average of 3 previous executions
                p95DurationMs: null,
                totalRetries: 2,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                undefined,
                error
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            // (6000 * 3 + 2000) / 4 = 20000 / 4 = 5000
            expect(callArgs.avgDurationMs).toBe(5000);
            expect(callArgs.totalExecutions).toBe(4);
            expect(callArgs.successfulExecutions).toBe(2);
            expect(callArgs.failedExecutions).toBe(2);
        });

        it('should handle avgDurationMs calculation with zero initial average', async () => {
            // Arrange
            const threadId = 'test-thread-016';
            const agentType = 'routine_generator';
            const status = 'completed';
            const durationMs = 4000;
            const retryCount = 0;
            const input = { targetDate: '2024-01-16' };

            const existingMetrics = {
                id: 'metrics-id-vwx',
                agentType: 'routine_generator',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 1,
                successfulExecutions: 1,
                failedExecutions: 0,
                avgDurationMs: 0, // Edge case: zero average
                p95DurationMs: null,
                totalRetries: 0,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            // (0 * 1 + 4000) / 2 = 2000
            expect(callArgs.avgDurationMs).toBe(2000);
        });

        it('should calculate correct average with large number of executions', async () => {
            // Arrange
            const threadId = 'test-thread-017';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 10000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            const existingMetrics = {
                id: 'metrics-id-yz',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 99,
                successfulExecutions: 95,
                failedExecutions: 4,
                avgDurationMs: 5000,
                p95DurationMs: null,
                totalRetries: 10,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            // (5000 * 99 + 10000) / 100 = 505000 / 100 = 5050
            expect(callArgs.avgDurationMs).toBe(5050);
            expect(callArgs.totalExecutions).toBe(100);
        });
    });

    describe('recordExecution() - Retry Count Accumulation', () => {
        it('should accumulate retry count for new metrics', async () => {
            // Arrange
            const threadId = 'test-thread-018';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 3;
            const input = { date: '2024-01-15' };

            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockInsert.values.mock.calls[1][0];
            expect(callArgs.totalRetries).toBe(3);
        });

        it('should accumulate retry count when updating existing metrics', async () => {
            // Arrange
            const threadId = 'test-thread-019';
            const agentType = 'routine_generator';
            const status = 'failed';
            const durationMs = 3000;
            const retryCount = 5;
            const input = { targetDate: '2024-01-16' };
            const error = 'Max retries reached';

            const existingMetrics = {
                id: 'metrics-id-retry',
                agentType: 'routine_generator',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 10,
                successfulExecutions: 8,
                failedExecutions: 2,
                avgDurationMs: 4000,
                p95DurationMs: null,
                totalRetries: 12,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                undefined,
                error
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            expect(callArgs.totalRetries).toBe(17); // 12 + 5
        });

        it('should handle zero retry count', async () => {
            // Arrange
            const threadId = 'test-thread-020';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            const existingMetrics = {
                id: 'metrics-id-zero-retry',
                agentType: 'daily_auditor',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 5,
                successfulExecutions: 5,
                failedExecutions: 0,
                avgDurationMs: 5000,
                p95DurationMs: null,
                totalRetries: 0,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            const callArgs = mockUpdate.set.mock.calls[0][0];
            expect(callArgs.totalRetries).toBe(0); // 0 + 0
        });
    });

    describe('recordExecution() - Error Handling', () => {
        it('should not throw error when transaction fails', async () => {
            // Arrange
            const threadId = 'test-thread-021';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            // Mock transaction to throw error
            (db.transaction as any).mockRejectedValue(new Error('Database connection failed'));

            // Act & Assert
            await expect(
                metricsCollector.recordExecution(
                    threadId,
                    agentType,
                    status,
                    durationMs,
                    retryCount,
                    input
                )
            ).resolves.not.toThrow();
        });

        it('should log error when metrics recording fails', async () => {
            // Arrange
            const threadId = 'test-thread-022';
            const agentType = 'routine_generator';
            const status = 'failed';
            const durationMs = 3000;
            const retryCount = 2;
            const input = { targetDate: '2024-01-16' };
            const error = 'Execution error';

            const dbError = new Error('Database write failed');
            (db.transaction as any).mockRejectedValue(dbError);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input,
                undefined,
                error
            );

            // Assert
            expect(logger.error).toHaveBeenCalledWith(
                'Failed to record metrics',
                expect.objectContaining({
                    threadId: 'test-thread-022',
                    agentType: 'routine_generator',
                    error: 'Database write failed',
                })
            );
        });

        it('should log error with unknown error message when error is not Error instance', async () => {
            // Arrange
            const threadId = 'test-thread-023';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            // Mock transaction to throw non-Error object
            (db.transaction as any).mockRejectedValue('String error');

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            expect(logger.error).toHaveBeenCalledWith(
                'Failed to record metrics',
                expect.objectContaining({
                    threadId: 'test-thread-023',
                    agentType: 'daily_auditor',
                    error: 'Unknown error',
                })
            );
        });

        it('should log success message when metrics recorded successfully', async () => {
            // Arrange
            const threadId = 'test-thread-024';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 1;
            const input = { date: '2024-01-15' };

            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            expect(logger.info).toHaveBeenCalledWith(
                'Metrics recorded successfully',
                {
                    threadId: 'test-thread-024',
                    agentType: 'daily_auditor',
                    status: 'completed',
                    durationMs: 5000,
                    retryCount: 1,
                }
            );
        });
    });

    describe('recordExecution() - Transaction Atomicity', () => {
        it('should execute both insert operations within same transaction', async () => {
            // Arrange
            const threadId = 'test-thread-025';
            const agentType = 'daily_auditor';
            const status = 'completed';
            const durationMs = 5000;
            const retryCount = 0;
            const input = { date: '2024-01-15' };

            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            expect(db.transaction).toHaveBeenCalledTimes(1);
            expect(mockTransaction.insert).toHaveBeenCalledTimes(2); // execution log + metrics
        });

        it('should execute insert and update within same transaction for existing metrics', async () => {
            // Arrange
            const threadId = 'test-thread-026';
            const agentType = 'routine_generator';
            const status = 'completed';
            const durationMs = 6000;
            const retryCount = 0;
            const input = { targetDate: '2024-01-16' };

            const existingMetrics = {
                id: 'metrics-id-txn',
                agentType: 'routine_generator',
                date: new Date().toISOString().split('T')[0],
                totalExecutions: 5,
                successfulExecutions: 4,
                failedExecutions: 1,
                avgDurationMs: 5000,
                p95DurationMs: null,
                totalRetries: 2,
                createdAt: new Date(),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([existingMetrics]);

            // Act
            await metricsCollector.recordExecution(
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
                input
            );

            // Assert
            expect(db.transaction).toHaveBeenCalledTimes(1);
            expect(mockTransaction.insert).toHaveBeenCalledTimes(1); // execution log only
            expect(mockTransaction.update).toHaveBeenCalledTimes(1); // metrics update
        });
    });
});
