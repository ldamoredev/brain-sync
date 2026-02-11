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

export interface BehaviorRepository {
    saveEmotions(logs: EmotionLog[]): Promise<SavedEntity[]>;
    saveTriggers(logs: TriggerLog[]): Promise<SavedEntity[]>;
    saveActions(logs: ActionLog[]): Promise<SavedEntity[]>;
}
