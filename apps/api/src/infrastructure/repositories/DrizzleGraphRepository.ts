import { db } from '../db';
import { relationships, emotionsLog, triggers, behaviorOutcomes } from '../db/schema';
import { GraphRepository, Relationship, GraphContext } from '../../domain/entities/GraphRepository';
import { eq, and, inArray, sql } from 'drizzle-orm';

export class DrizzleGraphRepository implements GraphRepository {
    async createRelationship(rel: Relationship): Promise<void> {
        await db.insert(relationships).values({
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            weight: rel.weight
        });
    }

    async findRelated(nodeId: string, type?: string): Promise<Relationship[]> {
        let query = db.select().from(relationships).where(eq(relationships.sourceId, nodeId));
        
        if (type) {
            query = db.select().from(relationships).where(and(eq(relationships.sourceId, nodeId), eq(relationships.type, type)));
        }

        const results = await query;
        
        return results.map(r => ({
            sourceId: r.sourceId,
            targetId: r.targetId,
            type: r.type,
            weight: r.weight || 1
        }));
    }

    async findContextualRelationships(noteIds: string[]): Promise<GraphContext[]> {
        if (noteIds.length === 0) return [];

        // This is a complex query. We want to find relationships where the source OR target
        // is related to the entities extracted from the given notes.
        
        // 1. Find all entities (triggers, emotions, actions) linked to these notes
        const relatedEmotions = await db.select({ id: emotionsLog.id, name: emotionsLog.emotion })
            .from(emotionsLog)
            .where(inArray(emotionsLog.noteId, noteIds));
            
        const relatedTriggers = await db.select({ id: triggers.id, name: triggers.description })
            .from(triggers)
            .where(inArray(triggers.noteId, noteIds));

        const relatedActions = await db.select({ id: behaviorOutcomes.id, name: behaviorOutcomes.action })
            .from(behaviorOutcomes)
            .where(inArray(behaviorOutcomes.noteId, noteIds));

        const allEntityIds = [
            ...relatedEmotions.map(e => e.id),
            ...relatedTriggers.map(t => t.id),
            ...relatedActions.map(a => a.id)
        ];

        if (allEntityIds.length === 0) return [];

        // 2. Find relationships between these entities
        const edges = await db.select()
            .from(relationships)
            .where(
                sql`${relationships.sourceId} IN ${allEntityIds} OR ${relationships.targetId} IN ${allEntityIds}`
            );

        // 3. Resolve names for the IDs to make it readable for the LLM
        const entityNameMap = new Map<string, string>();
        [...relatedEmotions, ...relatedTriggers, ...relatedActions].forEach(e => {
            entityNameMap.set(e.id, e.name);
        });

        const context: GraphContext[] = [];
        
        for (const edge of edges) {
            const sourceName = entityNameMap.get(edge.sourceId);
            const targetName = entityNameMap.get(edge.targetId);

            if (sourceName && targetName) {
                context.push({
                    source: sourceName,
                    target: targetName,
                    type: edge.type
                });
            }
        }

        return context;
    }
}
