import { db } from '../db';
import { emotionsLog, triggers, behaviorOutcomes } from '../db/schema';
import { BehaviorRepository, EmotionLog, TriggerLog, ActionLog, SavedEntity } from '../../domain/entities/BehaviorRepository';

export class DrizzleBehaviorRepository extends BehaviorRepository {
    async saveEmotions(logs: EmotionLog[]): Promise<SavedEntity[]> {
        if (logs.length === 0) return [];
        const result = await db.insert(emotionsLog).values(logs).returning({ id: emotionsLog.id, emotion: emotionsLog.emotion });
        
        return result.map(r => ({
            id: r.id,
            description: r.emotion,
            type: 'EMOTION'
        }));
    }

    async saveTriggers(logs: TriggerLog[]): Promise<SavedEntity[]> {
        if (logs.length === 0) return [];
        const result = await db.insert(triggers).values(logs).returning({ id: triggers.id, description: triggers.description });

        return result.map(r => ({
            id: r.id,
            description: r.description,
            type: 'TRIGGER'
        }));
    }

    async saveActions(logs: ActionLog[]): Promise<SavedEntity[]> {
        if (logs.length === 0) return [];
        const result = await db.insert(behaviorOutcomes).values(logs).returning({ id: behaviorOutcomes.id, action: behaviorOutcomes.action });

        return result.map(r => ({
            id: r.id,
            description: r.action,
            type: 'ACTION'
        }));
    }
}
