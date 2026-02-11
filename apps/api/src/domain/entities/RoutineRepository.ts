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

export interface RoutineRepository {
    save(routine: Omit<Routine, 'id' | 'createdAt'>): Promise<void>;
    update(date: string, activities: RoutineActivity[]): Promise<void>;
    findByDate(date: string): Promise<Routine | null>;
}
