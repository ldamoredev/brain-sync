import { db } from '../db';
import { dailySummaries } from '../db/schema';
import { DailySummaryRepository, DailySummary } from '../../domain/entities/DailySummaryRepository';
import { eq } from 'drizzle-orm';

export class DrizzleDailySummaryRepository implements DailySummaryRepository {
    async save(summary: Omit<DailySummary, 'id' | 'createdAt'>): Promise<void> {
        await db.insert(dailySummaries).values({
            date: summary.date,
            summary: summary.summary,
            riskLevel: summary.riskLevel,
            keyInsights: summary.keyInsights
        });
    }

    async findByDate(date: string): Promise<DailySummary | null> {
        const result = await db.select().from(dailySummaries).where(eq(dailySummaries.date, date)).limit(1) as any;
        if (result.length === 0) return null;
        
        const row = result[0];
        return {
            id: row.id,
            date: row.date,
            summary: row.summary,
            riskLevel: row.riskLevel,
            keyInsights: (row.keyInsights as string[]) || [],
            createdAt: row.createdAt
        };
    }
}
