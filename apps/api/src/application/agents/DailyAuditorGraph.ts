import { randomUUID } from 'crypto';
import { LLMProvider } from '../providers/LLMProvider';
import { CheckpointerProvider } from '../providers/CheckpointerProvider';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { DailySummaryRepository } from '../../domain/entities/DailySummaryRepository';
import { ChatMessage } from '@brain-sync/types';
import { JsonParser } from '../utils/JsonParser';
import { sanitizeInput } from '../utils/sanitizeInput';
import logger from '../../infrastructure/logger';
import { AgentGraph } from './AgentGraph';
import { DailyAuditorState, GraphConfig, GraphExecutionResult } from './types';
import { MetricsCollector } from '../../infrastructure/metrics/MetricsCollector';
import { AppError } from '../../domain/errors/AppError';

export class DailyAuditorGraph implements AgentGraph<DailyAuditorState, { date: string; approved?: boolean }, any> {
    private metricsCollector: MetricsCollector;

    constructor(
        private llmProvider: LLMProvider,
        private repositories: RepositoryProvider,
        private checkpointer: CheckpointerProvider
    ) {
        this.metricsCollector = new MetricsCollector();
    }

    async execute(
        input: { date: string },
        config?: GraphConfig
    ): Promise<GraphExecutionResult<DailyAuditorState>> {
        const threadId = config?.threadId || randomUUID();
        const maxRetries = config?.maxRetries ?? 3;
        const requiresHumanApproval = config?.requiresHumanApproval ?? false;
        const timeout = config?.timeout ?? 300000; // Default 5 minutes
        const startTime = Date.now();

        let state: DailyAuditorState;

        // Initialize or restore state
        if (config?.threadId) {
            const checkpoint = await this.checkpointer.load<DailyAuditorState>(config.threadId);
            if (!checkpoint) {
                throw new AppError('Thread de ejecución no encontrado', 404);
            }
            state = checkpoint.state;
            logger.info('Restored state from checkpoint', { threadId, currentNode: state.currentNode });
        } else {
            state = this.createInitialState(input.date, threadId);
            logger.info('Created initial state', { threadId, date: input.date });
        }

        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Execution timeout exceeded')), timeout);
        });

        // Create execution promise
        const executionPromise = this.executeGraph(state, threadId, maxRetries, requiresHumanApproval, startTime, input);

        try {
            // Race execution against timeout
            return await Promise.race([executionPromise, timeoutPromise]);
        } catch (error) {
            if (error instanceof Error && error.message === 'Execution timeout exceeded') {
                // Handle timeout
                state.status = 'failed';
                state.error = 'Tiempo de ejecución excedido';
                await this.checkpointer.save(threadId, state, state.currentNode, 'daily_auditor');
                logger.error('Execution timeout exceeded', { threadId, timeout });

                // Record metrics asynchronously
                const durationMs = Date.now() - startTime;
                this.recordMetricsAsync(threadId, 'failed', durationMs, state.retryCount, input, null, state.error);

                return {
                    success: false,
                    state,
                    threadId,
                    status: 'failed',
                    error: state.error
                };
            }
            throw error;
        }
    }

    private async executeGraph(
        state: DailyAuditorState,
        threadId: string,
        maxRetries: number,
        requiresHumanApproval: boolean,
        startTime: number,
        input: { date: string }
    ): Promise<GraphExecutionResult<DailyAuditorState>> {
        logger.info('Execution started', {
            threadId,
            agentType: 'daily_auditor',
            date: input.date,
            timestamp: new Date().toISOString()
        });

        try {
            // Execute graph nodes based on currentNode
            while (state.status === 'running') {
                const previousNode = state.currentNode;
                const nodeStartTime = Date.now();

                logger.info('Node execution started', {
                    threadId,
                    node: state.currentNode,
                    timestamp: new Date().toISOString()
                });

                switch (state.currentNode) {
                    case 'start':
                    case 'fetchNotes':
                        state = await this.fetchNotesNode(state);
                        break;

                    case 'analyzeNotes':
                        state = await this.analyzeNotesNode(state, maxRetries);
                        break;

                    case 'checkApproval':
                        state = await this.checkApprovalNode(state, requiresHumanApproval);
                        break;

                    case 'awaitingApproval':
                        // This node is a pause point - execution should stop here
                        // Resume will handle moving to the next node
                        const nodeDuration = Date.now() - nodeStartTime;
                        logger.info('Node execution completed', {
                            threadId,
                            node: state.currentNode,
                            durationMs: nodeDuration,
                            timestamp: new Date().toISOString()
                        });
                        return {
                            success: true,
                            state,
                            threadId,
                            status: 'paused'
                        };

                    case 'saveSummary':
                        state = await this.saveSummaryNode(state);
                        break;

                    case 'end':
                        state.status = 'completed';
                        break;

                    default:
                        throw new Error(`Unknown node: ${state.currentNode}`);
                }

                const nodeDuration = Date.now() - nodeStartTime;
                logger.info('Node execution completed', {
                    threadId,
                    node: previousNode,
                    nextNode: state.currentNode,
                    durationMs: nodeDuration,
                    timestamp: new Date().toISOString()
                });

                // Save checkpoint after each node transition
                if (previousNode !== state.currentNode) {
                    await this.checkpointer.save(threadId, state, state.currentNode, 'daily_auditor');
                    logger.info('Checkpoint saved', { threadId, node: state.currentNode });
                }

                // Check if we've paused
                if (state.status === 'paused') {
                    return {
                        success: true,
                        state,
                        threadId,
                        status: 'paused'
                    };
                }
            }

            const result = {
                success: state.status === 'completed',
                state,
                threadId,
                status: state.status,
                error: state.error
            };

            const totalDuration = Date.now() - startTime;
            logger.info('Execution completed', {
                threadId,
                agentType: 'daily_auditor',
                status: state.status,
                totalDurationMs: totalDuration,
                timestamp: new Date().toISOString()
            });

            // Record metrics asynchronously (fire-and-forget) only for terminal states
            if (state.status === 'completed' || state.status === 'failed') {
                const durationMs = Date.now() - startTime;
                this.recordMetricsAsync(threadId, state.status, durationMs, state.retryCount, input, state.analysis);
            }

            return result;
        } catch (error) {
            const totalDuration = Date.now() - startTime;
            state.status = 'failed';
            state.error = error instanceof Error ? error.message : 'Unknown error';
            await this.checkpointer.save(threadId, state, state.currentNode, 'daily_auditor');
            logger.error('Execution failed', {
                threadId,
                agentType: 'daily_auditor',
                error: state.error,
                totalDurationMs: totalDuration,
                timestamp: new Date().toISOString()
            });

            // Record metrics asynchronously (fire-and-forget)
            const durationMs = Date.now() - startTime;
            this.recordMetricsAsync(threadId, 'failed', durationMs, state.retryCount, input, null, state.error);

            return {
                success: false,
                state,
                threadId,
                status: 'failed',
                error: state.error
            };
        }
    }

    async resume(
        threadId: string,
        input?: { approved?: boolean }
    ): Promise<GraphExecutionResult<DailyAuditorState>> {
        const checkpoint = await this.checkpointer.load<DailyAuditorState>(threadId);

        if (!checkpoint) {
            throw new AppError('Thread de ejecución no encontrado', 404);
        }

        const state = checkpoint.state;

        if (state.status !== 'paused') {
            throw new Error(`Cannot resume execution that is not paused. Current status: ${state.status}`);
        }

        if (state.currentNode !== 'awaitingApproval') {
            throw new Error(`Cannot resume from node: ${state.currentNode}`);
        }

        // Update approval status and move to next node
        state.approved = input?.approved ?? false;
        state.status = 'running';
        state.updatedAt = new Date();


        // If approved, continue to saveSummary, otherwise go to end
        if (state.approved) {
            state.currentNode = 'saveSummary';
        } else {
            state.currentNode = 'end';
            state.status = 'completed'; // If not approved, mark as completed immediately
        }

        logger.info('Resuming execution', { threadId, approved: state.approved });

        await this.checkpointer.save(threadId, state, state.currentNode, 'daily_auditor');
        // Continue execution
        return this.execute({ date: state.date }, { threadId, maxRetries: 3, requiresHumanApproval: true });
    }

    async getStatus(threadId: string): Promise<{ status: string; state: DailyAuditorState }> {
        const checkpoint = await this.checkpointer.load<DailyAuditorState>(threadId);

        if (!checkpoint) {
            throw new AppError('Thread de ejecución no encontrado', 404);
        }

        return {
            status: checkpoint.state.status,
            state: checkpoint.state
        };
    }

    async cancel(threadId: string): Promise<void> {
        const checkpoint = await this.checkpointer.load<DailyAuditorState>(threadId);

        if (!checkpoint) {
            throw new AppError('Thread de ejecución no encontrado', 404);
        }

        checkpoint.state.status = 'failed';
        checkpoint.state.error = 'Execution cancelled by user';

        await this.checkpointer.save(threadId, checkpoint.state, checkpoint.state.currentNode, 'daily_auditor');
        logger.info('Execution cancelled', { threadId });
    }

    // Node implementations

    private async fetchNotesNode(state: DailyAuditorState): Promise<DailyAuditorState> {
        logger.info('Executing fetchNotes node', { threadId: state.threadId, date: state.date });

        try {
            const allNotes = await this.repositories.get(NoteRepository).findAll();
            const dayNotes = allNotes.filter(n => {
                const noteDate = new Date(n.createdAt).toISOString().split('T')[0];
                return noteDate === state.date;
            });

            logger.info('Notes fetched', { threadId: state.threadId, count: dayNotes.length });

            // If no notes found, complete execution
            if (dayNotes.length === 0) {
                return {
                    ...state,
                    notes: [],
                    currentNode: 'end',
                    status: 'completed',
                    updatedAt: new Date()
                };
            }

            return {
                ...state,
                notes: dayNotes.map(n => ({
                    id: n.id,
                    content: n.content,
                    createdAt: n.createdAt
                })),
                currentNode: 'analyzeNotes',
                updatedAt: new Date()
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            logger.error('Database error while fetching notes', {
                threadId: state.threadId,
                date: state.date,
                error: errorMessage
            });

            throw new AppError(
                'Database temporarily unavailable - failed to fetch notes',
                500
            );
        }
    }

    private async analyzeNotesNode(state: DailyAuditorState, maxRetries: number): Promise<DailyAuditorState> {
        logger.info('Executing analyzeNotes node', { threadId: state.threadId, retryCount: state.retryCount });

        // Sanitize note content before sending to LLM
        const sanitizedNotes = state.notes.map(n => sanitizeInput(n.content));
        const context = sanitizedNotes.join('\n\n');

        const prompt = `
Actúa como un "Auditor Diario" para la recuperación y salud emocional.
Analiza las notas del día:
${context}

Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
{
  "summary": "Resumen narrativo del día en una o dos oraciones",
  "riskLevel": 5,
  "keyInsights": [
    "Primer punto clave observado",
    "Segundo punto clave observado",
    "Tercer punto clave observado"
  ]
}

IMPORTANTE:
- NO agregues texto adicional fuera del JSON
- NO agregues comentarios dentro del JSON
- riskLevel debe ser un número entre 1 y 10
- keyInsights debe ser un array de strings
- Devuelve SOLO el objeto JSON, nada más
`;

        const messages: ChatMessage[] = [
            { role: 'system', content: 'Eres un auditor de salud mental. Devuelve solo JSON.' },
            { role: 'user', content: prompt },
        ];

        try {
            const response = await this.llmProvider.generateResponse(messages);
            const analysis = JsonParser.parseSafe(response, null);

            if (!analysis) {
                logger.warn('JSON parsing failed', {
                    threadId: state.threadId,
                    rawResponse: response,
                    retryCount: state.retryCount
                });
                throw new Error('Failed to parse LLM response as JSON');
            }

            logger.info('Analysis completed', { threadId: state.threadId, riskLevel: analysis.riskLevel });

            return {
                ...state,
                analysis: {
                    summary: analysis.summary || 'Resumen no disponible',
                    riskLevel: analysis.riskLevel || 1,
                    keyInsights: analysis.keyInsights || []
                },
                currentNode: 'checkApproval',
                retryCount: 0,
                updatedAt: new Date()
            };
        } catch (error) {
            const newRetryCount = state.retryCount + 1;

            if (newRetryCount >= maxRetries) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error('Ejecución fallida después de alcanzar el máximo de reintentos', {
                    threadId: state.threadId,
                    maxRetries,
                    error: errorMessage
                });
                return {
                    ...state,
                    status: 'failed',
                    error: `Failed to analyze notes after ${maxRetries} retries: ${errorMessage} `,
                    retryCount: newRetryCount,
                    updatedAt: new Date()
                };
            }

            // Exponential backoff with jitter, capped at 10 seconds
            const baseBackoffMs = Math.pow(2, newRetryCount) * 1000;
            const jitterMs = Math.random() * 1000;
            const backoffMs = Math.min(10000, baseBackoffMs + jitterMs);

            logger.warn('Análisis falló, reintentando con backoff exponencial', {
                threadId: state.threadId,
                retryCount: newRetryCount,
                backoffMs: Math.round(backoffMs),
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            await new Promise(resolve => setTimeout(resolve, backoffMs));

            return {
                ...state,
                retryCount: newRetryCount,
                updatedAt: new Date()
            };
        }
    }

    private async checkApprovalNode(
        state: DailyAuditorState,
        requiresHumanApproval: boolean
    ): Promise<DailyAuditorState> {
        logger.info('Executing checkApproval node', {
            threadId: state.threadId,
            riskLevel: state.analysis?.riskLevel,
            requiresHumanApproval
        });

        if (requiresHumanApproval && state.analysis && state.analysis.riskLevel >= 7) {
            logger.info('Approval required', { threadId: state.threadId });
            return {
                ...state,
                requiresApproval: true,
                status: 'paused',
                currentNode: 'awaitingApproval',
                updatedAt: new Date()
            };
        }

        return {
            ...state,
            currentNode: 'saveSummary',
            updatedAt: new Date()
        };
    }

    private async saveSummaryNode(state: DailyAuditorState): Promise<DailyAuditorState> {
        logger.info('Executing saveSummary node', { threadId: state.threadId });

        // Only save if approved or approval not required
        if (state.requiresApproval && !state.approved) {
            logger.info('Summary not saved - not approved', { threadId: state.threadId });
            return {
                ...state,
                currentNode: 'end',
                status: 'completed',
                updatedAt: new Date()
            };
        }

        if (!state.analysis) {
            throw new Error('Cannot save summary without analysis');
        }

        try {
            await this.repositories.get(DailySummaryRepository).save({
                date: state.date,
                summary: state.analysis.summary,
                riskLevel: state.analysis.riskLevel,
                keyInsights: state.analysis.keyInsights,
            });

            logger.info('Summary saved', { threadId: state.threadId });

            return {
                ...state,
                currentNode: 'end',
                status: 'completed',
                updatedAt: new Date()
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            logger.error('Database error while saving summary', {
                threadId: state.threadId,
                error: errorMessage
            });

            throw new AppError(
                'Database temporarily unavailable - failed to save summary',
                500
            );
        }
    }

    private createInitialState(date: string, threadId: string): DailyAuditorState {
        return {
            threadId,
            status: 'running',
            currentNode: 'start',
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            date,
            notes: [],
            analysis: null,
            requiresApproval: false,
            approved: false
        };
    }

    /**
     * Records metrics asynchronously (fire-and-forget)
     * This method does not block execution and errors are logged but not thrown
     */
    private recordMetricsAsync(
        threadId: string,
        status: 'completed' | 'failed',
        durationMs: number,
        retryCount: number,
        input: any,
        output?: any,
        error?: string
    ): void {
        // Fire-and-forget: don't await, don't block execution
        this.metricsCollector
            .recordExecution(threadId, 'daily_auditor', status, durationMs, retryCount, input, output, error)
            .catch((err) => {
                logger.error('Failed to record metrics asynchronously', {
                    threadId,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            });
    }
}
