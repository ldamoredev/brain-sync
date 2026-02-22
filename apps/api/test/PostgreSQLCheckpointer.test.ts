import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLCheckpointer } from '../src/infrastructure/checkpointer/PostgreSQLCheckpointer';
import { Checkpoint } from '../src/application/providers/CheckpointerProvider';

// Mock the database module
vi.mock('../src/infrastructure/db/index', () => ({
    db: {
        insert: vi.fn(),
        select: vi.fn(),
        delete: vi.fn(),
    },
}));

// Mock the schema module
vi.mock('../src/infrastructure/db/schema', () => ({
    agentCheckpoints: {
        id: 'id',
        threadId: 'thread_id',
        state: 'state',
        nodeId: 'node_id',
        agentType: 'agent_type',
        createdAt: 'created_at',
    },
}));

// Mock drizzle-orm functions
vi.mock('drizzle-orm', () => ({
    eq: vi.fn((field, value) => ({ field, value, type: 'eq' })),
    desc: vi.fn((field) => ({ field, type: 'desc' })),
    asc: vi.fn((field) => ({ field, type: 'asc' })),
    and: vi.fn((...conditions) => ({ conditions, type: 'and' })),
}));

// Mock crypto module
vi.mock('crypto', () => ({
    randomUUID: vi.fn(() => 'test-uuid-123'),
}));

import { db } from '../src/infrastructure/db/index';

describe('PostgreSQLCheckpointer', () => {
    let checkpointer: PostgreSQLCheckpointer;
    let mockInsert: any;
    let mockSelect: any;
    let mockDelete: any;

    beforeEach(() => {
        vi.clearAllMocks();
        checkpointer = new PostgreSQLCheckpointer();

        // Setup mock chain for insert
        mockInsert = {
            values: vi.fn().mockResolvedValue(undefined),
        };
        (db.insert as any).mockReturnValue(mockInsert);

        // Setup mock chain for select
        mockSelect = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
        };
        (db.select as any).mockReturnValue(mockSelect);

        // Setup mock chain for delete
        mockDelete = {
            where: vi.fn().mockResolvedValue(undefined),
        };
        (db.delete as any).mockReturnValue(mockDelete);
    });

    describe('save()', () => {
        it('should save checkpoint and return UUID', async () => {
            // Arrange
            const threadId = 'test-thread-123';
            const state = { status: 'running', data: 'test' };
            const nodeId = 'testNode';

            // Act
            const result = await checkpointer.save(threadId, state, nodeId);

            // Assert
            expect(result).toBe('test-uuid-123');
            expect(db.insert).toHaveBeenCalledTimes(1);
            expect(mockInsert.values).toHaveBeenCalledWith({
                id: 'test-uuid-123',
                threadId: 'test-thread-123',
                state: state,
                nodeId: 'testNode',
                agentType: 'unknown',
            });
        });

        it('should save checkpoint with complex state object', async () => {
            // Arrange
            const threadId = 'thread-456';
            const complexState = {
                status: 'paused',
                currentNode: 'analyzeNotes',
                notes: [
                    { id: '1', content: 'Note 1', createdAt: new Date() },
                    { id: '2', content: 'Note 2', createdAt: new Date() },
                ],
                analysis: {
                    summary: 'Test summary',
                    riskLevel: 7,
                    keyInsights: ['insight1', 'insight2'],
                },
                retryCount: 2,
            };
            const nodeId = 'analyzeNotes';

            // Act
            const result = await checkpointer.save(threadId, complexState, nodeId);

            // Assert
            expect(result).toBe('test-uuid-123');
            expect(mockInsert.values).toHaveBeenCalledWith({
                id: 'test-uuid-123',
                threadId: 'thread-456',
                state: complexState,
                nodeId: 'analyzeNotes',
                agentType: 'unknown',
            });
        });
    });

    describe('load()', () => {
        it('should return most recent checkpoint when checkpointId not provided', async () => {
            // Arrange
            const threadId = 'test-thread-123';
            const mockCheckpoint = {
                id: 'checkpoint-1',
                threadId: 'test-thread-123',
                state: { status: 'running', data: 'test' },
                nodeId: 'testNode',
                createdAt: new Date('2024-01-15T10:00:00Z'),
            };

            // Mock the query chain to return the checkpoint
            mockSelect.limit = vi.fn().mockResolvedValue([mockCheckpoint]);

            // Act
            const result = await checkpointer.load(threadId);

            // Assert
            expect(result).toEqual({
                id: 'checkpoint-1',
                threadId: 'test-thread-123',
                state: { status: 'running', data: 'test' },
                nodeId: 'testNode',
                createdAt: mockCheckpoint.createdAt,
            });
            expect(db.select).toHaveBeenCalledTimes(1);
            expect(mockSelect.from).toHaveBeenCalledTimes(1);
            expect(mockSelect.where).toHaveBeenCalled();
            expect(mockSelect.orderBy).toHaveBeenCalled();
            expect(mockSelect.limit).toHaveBeenCalledWith(1);
        });

        it('should return specific checkpoint when checkpointId provided', async () => {
            // Arrange
            const threadId = 'test-thread-123';
            const checkpointId = 'specific-checkpoint-id';
            const mockCheckpoint = {
                id: 'specific-checkpoint-id',
                threadId: 'test-thread-123',
                state: { status: 'paused', data: 'specific' },
                nodeId: 'awaitingApproval',
                createdAt: new Date('2024-01-15T11:00:00Z'),
            };

            // Mock the query chain - where() with and() returns a promise that resolves to the checkpoint
            mockSelect.where = vi.fn().mockResolvedValue([mockCheckpoint]);

            // Act
            const result = await checkpointer.load(threadId, checkpointId);

            // Assert
            expect(result).toEqual({
                id: 'specific-checkpoint-id',
                threadId: 'test-thread-123',
                state: { status: 'paused', data: 'specific' },
                nodeId: 'awaitingApproval',
                createdAt: mockCheckpoint.createdAt,
            });
            expect(mockSelect.where).toHaveBeenCalledTimes(1);
        });

        it('should return null for non-existent threadId', async () => {
            // Arrange
            const threadId = 'non-existent-thread';

            // Mock the query chain to return empty array
            mockSelect.limit = vi.fn().mockResolvedValue([]);

            // Act
            const result = await checkpointer.load(threadId);

            // Assert
            expect(result).toBeNull();
            expect(db.select).toHaveBeenCalledTimes(1);
        });

        it('should return null when specific checkpoint not found', async () => {
            // Arrange
            const threadId = 'test-thread-123';
            const checkpointId = 'non-existent-checkpoint';

            // Mock the query chain - where() with and() returns empty array
            mockSelect.where = vi.fn().mockResolvedValue([]);

            // Act
            const result = await checkpointer.load(threadId, checkpointId);

            // Assert
            expect(result).toBeNull();
        });

        it('should deserialize complex state correctly', async () => {
            // Arrange
            const threadId = 'test-thread-123';
            const complexState = {
                status: 'completed',
                currentNode: 'end',
                notes: [{ id: '1', content: 'Note', createdAt: new Date() }],
                analysis: {
                    summary: 'Complex analysis',
                    riskLevel: 5,
                    keyInsights: ['key1', 'key2', 'key3'],
                },
                retryCount: 0,
                validationAttempts: 2,
            };
            const mockCheckpoint = {
                id: 'checkpoint-complex',
                threadId: 'test-thread-123',
                state: complexState,
                nodeId: 'end',
                createdAt: new Date('2024-01-15T12:00:00Z'),
            };

            mockSelect.limit = vi.fn().mockResolvedValue([mockCheckpoint]);

            // Act
            const result = await checkpointer.load<typeof complexState>(threadId);

            // Assert
            expect(result).not.toBeNull();
            expect(result!.state).toEqual(complexState);
            expect(result!.state.analysis.keyInsights).toHaveLength(3);
        });
    });

    describe('list()', () => {
        it('should return checkpoints in chronological order', async () => {
            // Arrange
            const threadId = 'test-thread-123';
            const mockCheckpoints = [
                {
                    id: 'checkpoint-1',
                    threadId: 'test-thread-123',
                    state: { status: 'running', step: 1 },
                    nodeId: 'fetchNotes',
                    createdAt: new Date('2024-01-15T10:00:00Z'),
                },
                {
                    id: 'checkpoint-2',
                    threadId: 'test-thread-123',
                    state: { status: 'running', step: 2 },
                    nodeId: 'analyzeNotes',
                    createdAt: new Date('2024-01-15T10:05:00Z'),
                },
                {
                    id: 'checkpoint-3',
                    threadId: 'test-thread-123',
                    state: { status: 'paused', step: 3 },
                    nodeId: 'awaitingApproval',
                    createdAt: new Date('2024-01-15T10:10:00Z'),
                },
            ];

            // Mock the query chain to return checkpoints
            mockSelect.orderBy = vi.fn().mockResolvedValue(mockCheckpoints);

            // Act
            const result = await checkpointer.list(threadId);

            // Assert
            expect(result).toHaveLength(3);
            expect(result[0].id).toBe('checkpoint-1');
            expect(result[1].id).toBe('checkpoint-2');
            expect(result[2].id).toBe('checkpoint-3');
            expect(result[0].createdAt.getTime()).toBeLessThan(result[1].createdAt.getTime());
            expect(result[1].createdAt.getTime()).toBeLessThan(result[2].createdAt.getTime());
            expect(db.select).toHaveBeenCalledTimes(1);
            expect(mockSelect.orderBy).toHaveBeenCalled();
        });

        it('should return empty array for thread with no checkpoints', async () => {
            // Arrange
            const threadId = 'empty-thread';

            // Mock the query chain to return empty array
            mockSelect.orderBy = vi.fn().mockResolvedValue([]);

            // Act
            const result = await checkpointer.list(threadId);

            // Assert
            expect(result).toEqual([]);
            expect(result).toHaveLength(0);
        });

        it('should return single checkpoint for thread with one checkpoint', async () => {
            // Arrange
            const threadId = 'single-checkpoint-thread';
            const mockCheckpoint = {
                id: 'only-checkpoint',
                threadId: 'single-checkpoint-thread',
                state: { status: 'completed' },
                nodeId: 'end',
                createdAt: new Date('2024-01-15T10:00:00Z'),
            };

            mockSelect.orderBy = vi.fn().mockResolvedValue([mockCheckpoint]);

            // Act
            const result = await checkpointer.list(threadId);

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('only-checkpoint');
        });
    });

    describe('delete()', () => {
        it('should remove all checkpoints for threadId', async () => {
            // Arrange
            const threadId = 'test-thread-123';

            // Act
            await checkpointer.delete(threadId);

            // Assert
            expect(db.delete).toHaveBeenCalledTimes(1);
            expect(mockDelete.where).toHaveBeenCalledTimes(1);
        });

        it('should not throw error when deleting non-existent thread', async () => {
            // Arrange
            const threadId = 'non-existent-thread';

            // Act & Assert
            await expect(checkpointer.delete(threadId)).resolves.not.toThrow();
            expect(db.delete).toHaveBeenCalledTimes(1);
        });

        it('should successfully delete thread with multiple checkpoints', async () => {
            // Arrange
            const threadId = 'thread-with-many-checkpoints';

            // Act
            await checkpointer.delete(threadId);

            // Assert
            expect(db.delete).toHaveBeenCalledTimes(1);
            expect(mockDelete.where).toHaveBeenCalledTimes(1);
        });
    });
});
