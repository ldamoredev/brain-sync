import { db } from '../db';
import { routines } from '../db/schema';
import { RoutineRepository, Routine, RoutineActivity } from '../../domain/entities/RoutineRepository';
import { eq } from 'drizzle-orm';

export class DrizzleRoutineRepository implements RoutineRepository {
    async save(routine: Omit<Routine, 'id' | 'createdAt'>): Promise<void> {
        await db.insert(routines).values({
            targetDate: routine.targetDate,
            activities: routine.activities
        });
    }

    async update(date: string, activities: RoutineActivity[]): Promise<void> {
        await db.update(routines)
            .set({ activities })
            .where(eq(routines.targetDate, date));
    }

    async findByDate(date: string): Promise<Routine | null> {
        const result = await db.select().from(routines).where(eq(routines.targetDate, date)).limit(1) as any;
        if (result.length === 0) return null;
        
        const row = result[0];
        return {
            id: row.id,
            targetDate: row.targetDate,
            activities: (row.activities as RoutineActivity[]) || [],
            createdAt: row.createdAt
        };
    }
}
