import { BaseAgentState, GraphConfig, GraphExecutionResult } from './types';

/**
 * Base interface for all agent graphs
 * Defines the contract for executing, resuming, and managing agent executions
 */
export interface AgentGraph<TState extends BaseAgentState, TInput, TOutput> {
    /**
     * Execute the graph from start or from a checkpoint
     * @param input - Input data for the graph execution
     * @param config - Optional configuration including threadId, maxRetries, etc.
     * @returns GraphExecutionResult with final state and status
     */
    execute(input: TInput, config?: GraphConfig): Promise<GraphExecutionResult<TState>>;

    /**
     * Resume a paused execution from a checkpoint
     * @param threadId - The thread ID of the paused execution
     * @param input - Optional partial input to update state (e.g., approval decision)
     * @returns GraphExecutionResult with updated state and status
     */
    resume(threadId: string, input?: Partial<TInput>): Promise<GraphExecutionResult<TState>>;

    /**
     * Get the current status of an execution
     * @param threadId - The thread ID to query
     * @returns Current status and state
     */
    getStatus(threadId: string): Promise<{ status: string; state: TState }>;

    /**
     * Cancel a running execution
     * @param threadId - The thread ID to cancel
     */
    cancel(threadId: string): Promise<void>;
}
