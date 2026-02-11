export interface DailySummary {
    id: string;
    date: string;
    summary: string;
    riskLevel: number;
    keyInsights: string[];
    createdAt: Date;
}

export interface DailySummaryRepository {
    save(summary: Omit<DailySummary, 'id' | 'createdAt'>): Promise<void>;
    findByDate(date: string): Promise<DailySummary | null>;
}
