import { DailySummaryRepository, DailySummary } from "../../domain/entities/DailySummaryRepository";
import { RoutineRepository, Routine, RoutineActivity } from "../../domain/entities/RoutineRepository";
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class GetAgentData {
    constructor(
        private repositories: RepositoryProvider,
    ) {}

    async executeGetAudit(date: string): Promise<DailySummary | null> {
        return this.repositories.get(DailySummaryRepository).findByDate(date);
    }

    async executeGetRoutine(date: string): Promise<Routine | null> {
        return this.repositories.get(RoutineRepository).findByDate(date);
    }

    async executeUpdateRoutine(date: string, activities: RoutineActivity[]): Promise<void> {
        return this.repositories.get(RoutineRepository).update(date, activities);
    }
}
