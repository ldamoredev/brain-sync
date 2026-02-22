import { randomUUID } from 'crypto';
import { eq, desc, asc, and } from 'drizzle-orm';
import { CheckpointerProvider, Checkpoint } from '../../application/providers/CheckpointerProvider';
import { db } from '../db/index';
import { agentCheckpoints } from '../db/schema';

export class PostgreSQLCheckpointer implements CheckpointerProvider {
    async save<T>(threadId: string, state: T, nodeId: string, agentType: string = 'unknown'): Promise<string> {
        const checkpointId = randomUUID();
        
        await db.insert(agentCheckpoints).values({
            id: checkpointId,
            threadId,
            state: state as any,
            nodeId,
            agentType,
        });

        return checkpointId;
    }

    async load<T>(threadId: string, checkpointId?: string): Promise<Checkpoint<T> | null> {
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
    }

    async list(threadId: string): Promise<Checkpoint[]> {
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
    }

    async delete(threadId: string): Promise<void> {
        await db
            .delete(agentCheckpoints)
            .where(eq(agentCheckpoints.threadId, threadId));
    }
}
