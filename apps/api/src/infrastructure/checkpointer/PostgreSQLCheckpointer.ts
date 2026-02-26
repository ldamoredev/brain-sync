import { randomUUID } from 'crypto';
import { eq, desc, asc, and } from 'drizzle-orm';
import { CheckpointerProvider, Checkpoint } from '../../application/providers/CheckpointerProvider';
import { db } from '../db/index';
import { agentCheckpoints } from '../db/schema';
import { AppError } from '../../domain/errors/AppError';
import logger from '../logger';

export class PostgreSQLCheckpointer implements CheckpointerProvider {
async save<T>(threadId: string, state: T, nodeId: string, agentType: string = 'unknown'): Promise<string> {
    const checkpointId = randomUUID();
    
    try {
        await db.insert(agentCheckpoints).values({
            id: checkpointId,
            threadId,
            userId: null, // Explicitly set to null for MVP (will be set when auth is implemented)
            state: state as any,
            nodeId,
            agentType,
        });

        return checkpointId;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
        logger.error('Database error while saving checkpoint', {
            threadId,
            nodeId,
            agentType,
            error: errorMessage
        });
        
        throw new AppError(
            'Database temporarily unavailable - failed to save checkpoint',
            500
        );
    }
}


    async load<T>(threadId: string, checkpointId?: string): Promise<Checkpoint<T> | null> {
        try {
            let results;
            
            if (checkpointId) {
                // When checkpointId provided, use and() to combine conditions
                results = await db
                    .select()
                    .from(agentCheckpoints)
                    .where(and(
                        eq(agentCheckpoints.threadId, threadId),
                        eq(agentCheckpoints.id, checkpointId)
                    ));
            } else {
                // When no checkpointId, get most recent
                results = await db
                    .select()
                    .from(agentCheckpoints)
                    .where(eq(agentCheckpoints.threadId, threadId))
                    .orderBy(desc(agentCheckpoints.createdAt))
                    .limit(1);
            }
            
            if (results.length === 0) {
                return null;
            }

            const row = results[0];
            
            return {
                id: row.id,
                threadId: row.threadId,
                state: row.state as T,
                nodeId: row.nodeId,
                agentType: row.agentType,
                createdAt: row.createdAt,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            logger.error('Database error while loading checkpoint', {
                threadId,
                checkpointId,
                error: errorMessage
            });
            
            throw new AppError(
                'Database temporarily unavailable - failed to load checkpoint',
                500
            );
        }
    }

    async list(threadId: string): Promise<Checkpoint[]> {
        try {
            const results = await db
                .select()
                .from(agentCheckpoints)
                .where(eq(agentCheckpoints.threadId, threadId))
                .orderBy(asc(agentCheckpoints.createdAt));

            return results.map(row => ({
                id: row.id,
                threadId: row.threadId,
                state: row.state,
                nodeId: row.nodeId,
                agentType: row.agentType,
                createdAt: row.createdAt,
            }));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            logger.error('Database error while listing checkpoints', {
                threadId,
                error: errorMessage
            });
            
            throw new AppError(
                'Database temporarily unavailable - failed to list checkpoints',
                500
            );
        }
    }

    async delete(threadId: string): Promise<void> {
        try {
            await db
                .delete(agentCheckpoints)
                .where(eq(agentCheckpoints.threadId, threadId));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            logger.error('Database error while deleting checkpoints', {
                threadId,
                error: errorMessage
            });
            
            throw new AppError(
                'Database temporarily unavailable - failed to delete checkpoints',
                500
            );
        }
    }
}
