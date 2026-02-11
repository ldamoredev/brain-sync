export interface DailySummary {
    id: string;
    date: string;
    summary: string;
    riskLevel: number;
    keyInsights: string[];
    createdAt: Date;
}

export abstract class DailySummaryRepository {
    abstract save(summary: Omit<DailySummary, 'id' | 'createdAt'>): Promise<void>;
    abstract findByDate(date: string): Promise<DailySummary | null>;
}
