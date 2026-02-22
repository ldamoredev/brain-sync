import { db } from '../db';
import { agentExecutionLogs, agentMetrics } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import logger from '../logger';

export class MetricsCollector {
    /**
     * Records execution metrics for an agent run
     * This method is designed to be fire-and-forget (asynchronous)
     * 
     * @param threadId - Unique thread identifier for the execution
     * @param agentType - Type of agent ('daily_auditor' | 'routine_generator')
     * @param status - Final status of execution ('completed' | 'failed')
     * @param durationMs - Total execution duration in milliseconds
     * @param retryCount - Number of retries during execution
     * @param input - Input data for the execution
     * @param output - Output data from the execution (optional)
     * @param error - Error message if execution failed (optional)
     */
    async recordExecution(
        threadId: string,
        agentType: string,
        status: 'completed' | 'failed',
        durationMs: number,
        retryCount: number,
        input: any,
        output?: any,
        error?: string
    ): Promise<void> {
        try {
            // Use a transaction to ensure atomicity
            await db.transaction(async (tx) => {
                // 1. Insert execution log
                await tx.insert(agentExecutionLogs).values({
                    threadId,
                    agentType,
                    status,
                    input,
                    output: output || null,
                    error: error || null,
                    durationMs,
                    retryCount,
                    startedAt: new Date(Date.now() - durationMs), // Calculate start time
                    completedAt: new Date(),
                });

                // 2. Upsert daily metrics
                const today = new Date().toISOString().split('T')[0];

                // Check if metrics exist for today
                const existingMetrics = await tx
                    .select()
                    .from(agentMetrics)
                    .where(
                        and(
                            eq(agentMetrics.agentType, agentType),
                            eq(agentMetrics.date, today)
                        )
                    )
                    .limit(1);

                if (existingMetrics.length > 0) {
                    // Update existing metrics
                    const current = existingMetrics[0];
                    const newTotalExecutions = (current.totalExecutions || 0) + 1;
                    const newSuccessfulExecutions = status === 'completed' 
                        ? (current.successfulExecutions || 0) + 1 
                        : (current.successfulExecutions || 0);
                    const newFailedExecutions = status === 'failed' 
                        ? (current.failedExecutions || 0) + 1 
                        : (current.failedExecutions || 0);
                    const newTotalRetries = (current.totalRetries || 0) + retryCount;

                    // Calculate rolling average for avgDurationMs
                    const currentAvg = current.avgDurationMs || 0;
                    const currentTotal = current.totalExecutions || 0;
                    const newAvgDurationMs = Math.round(
                        (currentAvg * currentTotal + durationMs) / newTotalExecutions
                    );

                    await tx
                        .update(agentMetrics)
                        .set({
                            totalExecutions: newTotalExecutions,
                            successfulExecutions: newSuccessfulExecutions,
                            failedExecutions: newFailedExecutions,
                            avgDurationMs: newAvgDurationMs,
                            totalRetries: newTotalRetries,
                        })
                        .where(eq(agentMetrics.id, current.id));
                } else {
                    // Insert new metrics
                    await tx.insert(agentMetrics).values({
                        agentType,
                        date: today,
                        totalExecutions: 1,
                        successfulExecutions: status === 'completed' ? 1 : 0,
                        failedExecutions: status === 'failed' ? 1 : 0,
                        avgDurationMs: durationMs,
                        p95DurationMs: null, // Will be calculated separately if needed
                        totalRetries: retryCount,
                    });
                }
            });

            logger.info('Metrics recorded successfully', {
                threadId,
                agentType,
                status,
                durationMs,
                retryCount,
            });
        } catch (error) {
            // Log error but don't throw - metrics collection should not break execution
            logger.error('Failed to record metrics', {
                threadId,
                agentType,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}
