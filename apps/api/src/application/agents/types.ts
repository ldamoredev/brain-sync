// Base state for all agents
export interface BaseAgentState {
    threadId: string;
    status: 'running' | 'paused' | 'completed' | 'failed';
    currentNode: string;
    error?: string;
    retryCount: number;
    createdAt: Date;
    updatedAt: Date;
}

// Daily Auditor State
export interface DailyAuditorState extends BaseAgentState {
    date: string;
    notes: Array<{ id: string; content: string; createdAt: Date }>;
    analysis: {
        summary: string;
        riskLevel: number;
        keyInsights: string[];
    } | null;
    requiresApproval: boolean;
    approved: boolean;
}

// Routine Generator State
export interface RoutineGeneratorState extends BaseAgentState {
    date: string;
    yesterdayContext: string;
    analysisResult: {
        riskLevel: number;
        recommendations: string[];
    } | null;
    rawSchedule: any | null;
    validatedSchedule: any | null;
    formattedRoutine: {
        activities: Array<{
            time: string;
            activity: string;
            expectedBenefit: string;
        }>;
    } | null;
    validationAttempts: number;
    requiresApproval: boolean;
    approved: boolean;
}

// Graph Configuration Interface
export interface GraphConfig {
    threadId?: string;
    checkpointId?: string;
    maxRetries?: number;
    requiresHumanApproval?: boolean;
    timeout?: number;
}

// Graph Execution Result
export interface GraphExecutionResult<T> {
    success: boolean;
    state: T;
    threadId: string;
    status: 'completed' | 'paused' | 'failed';
    error?: string;
}

// Node Function Type
export type NodeFunction<TState> = (
    state: TState,
    config: GraphConfig
) => Promise<Partial<TState>>;

// Conditional Edge Type
export type ConditionalEdge<TState> = (
    state: TState
) => string; // Returns next node name
