import { DailySummaryRepository, DailySummary } from "../../domain/entities/DailySummaryRepository";
import { RoutineRepository, Routine, RoutineActivity } from "../../domain/entities/RoutineRepository";
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class GetAgentData {
    constructor(
        private repositories: RepositoryProvider,
    ) {}

    async getAudit(date: string): Promise<DailySummary | null> {
        return this.repositories.get(DailySummaryRepository).findByDate(date);
    }

    async getRoutine(date: string): Promise<Routine | null> {
        return this.repositories.get(RoutineRepository).findByDate(date);
    }

    async updateRoutine(date: string, activities: RoutineActivity[]): Promise<void> {
        return this.repositories.get(RoutineRepository).update(date, activities);
    }
}
