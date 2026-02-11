export interface RoutineActivity {
    time: string;
    activity: string;
    expectedBenefit: string;
    completed?: boolean;
}

export interface Routine {
    id: string;
    targetDate: string;
    activities: RoutineActivity[];
    createdAt: Date;
}

export abstract class RoutineRepository {
    abstract save(routine: Omit<Routine, 'id' | 'createdAt'>): Promise<void>;
    abstract update(date: string, activities: RoutineActivity[]): Promise<void>;
    abstract findByDate(date: string): Promise<Routine | null>;
}
