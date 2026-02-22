export interface Checkpoint<T = any> {
    id: string;
    threadId: string;
    state: T;
    nodeId: string;
    agentType?: string;
    createdAt: Date;
}

export interface CheckpointerProvider {
    save<T>(threadId: string, state: T, nodeId: string, agentType?: string): Promise<string>;
    load<T>(threadId: string, checkpointId?: string): Promise<Checkpoint<T> | null>;
    list(threadId: string): Promise<Checkpoint[]>;
    delete(threadId: string): Promise<void>;
}
