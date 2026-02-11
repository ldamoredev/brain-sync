export interface EmotionLog {
    noteId: string;
    emotion: string;
    intensity: number;
}

export interface TriggerLog {
    noteId: string;
    description: string;
    category: string;
}

export interface ActionLog {
    noteId: string;
    action: string;
    outcomeType: 'Positive' | 'Negative' | 'Neutral';
}

export interface SavedEntity {
    id: string;
    description: string; // The text value (emotion name, trigger description, etc.)
    type: 'EMOTION' | 'TRIGGER' | 'ACTION';
}

export abstract class BehaviorRepository {
    abstract saveEmotions(logs: EmotionLog[]): Promise<SavedEntity[]>;
    abstract saveTriggers(logs: TriggerLog[]): Promise<SavedEntity[]>;
    abstract saveActions(logs: ActionLog[]): Promise<SavedEntity[]>;
}
