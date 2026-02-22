import { randomUUID } from 'crypto';
import { LLMProvider } from '../providers/LLMProvider';
import { CheckpointerProvider } from '../providers/CheckpointerProvider';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';
import { DailySummaryRepository } from '../../domain/entities/DailySummaryRepository';
import { RoutineRepository } from '../../domain/entities/RoutineRepository';
import { ChatMessage } from '@brain-sync/types';
import { JsonParser } from '../utils/JsonParser';
import { sanitizeInput } from '../utils/sanitizeInput';
import logger from '../../infrastructure/logger';
import { AgentGraph } from './AgentGraph';
import { RoutineGeneratorState, GraphConfig, GraphExecutionResult } from './types';
import { MetricsCollector } from '../../infrastructure/metrics/MetricsCollector';
import { AppError } from '../../domain/errors/AppError';

export class RoutineGeneratorGraph implements AgentGraph<RoutineGeneratorState, { date: string; approved?: boolean }, any> {
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
    ): Promise<GraphExecutionResult<RoutineGeneratorState>> {
        const threadId = config?.threadId || randomUUID();
        const maxRetries = config?.maxRetries ?? 3;
        const requiresHumanApproval = config?.requiresHumanApproval ?? false;
        const timeout = config?.timeout ?? 300000; // Default 5 minutes
        const startTime = Date.now();

        let state: RoutineGeneratorState;

        // Initialize or restore state
        if (config?.threadId) {
            const checkpoint = await this.checkpointer.load<RoutineGeneratorState>(config.threadId);
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
                await this.checkpointer.save(threadId, state, state.currentNode, 'routine_generator');
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
        state: RoutineGeneratorState,
        threadId: string,
        maxRetries: number,
        requiresHumanApproval: boolean,
        startTime: number,
        input: { date: string }
    ): Promise<GraphExecutionResult<RoutineGeneratorState>> {
        logger.info('Execution started', { 
            threadId, 
            agentType: 'routine_generator',
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
                    case 'analyzer':
                        state = await this.analyzerNode(state);
                        break;

                    case 'scheduler':
                        state = await this.schedulerNode(state, maxRetries);
                        break;

                    case 'validator':
                        state = await this.validatorNode(state);
                        break;

                    case 'formatter':
                        state = await this.formatterNode(state);
                        break;

                    case 'checkApproval':
                        state = await this.checkApprovalNode(state, requiresHumanApproval);
                        break;

                    case 'awaitingApproval':
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

                    case 'saveRoutine':
                        state = await this.saveRoutineNode(state);
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
                    await this.checkpointer.save(threadId, state, state.currentNode, 'routine_generator');
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
                agentType: 'routine_generator',
                status: state.status,
                totalDurationMs: totalDuration,
                timestamp: new Date().toISOString()
            });

            // Record metrics asynchronously (fire-and-forget) only for terminal states
            if (state.status === 'completed' || state.status === 'failed') {
                const durationMs = Date.now() - startTime;
                this.recordMetricsAsync(threadId, state.status, durationMs, state.retryCount, input, state.formattedRoutine);
            }

            return result;
        } catch (error) {
            const totalDuration = Date.now() - startTime;
            state.status = 'failed';
            state.error = error instanceof Error ? error.message : 'Unknown error';
            await this.checkpointer.save(threadId, state, state.currentNode, 'routine_generator');
            logger.error('Execution failed', { 
                threadId, 
                agentType: 'routine_generator',
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
    ): Promise<GraphExecutionResult<RoutineGeneratorState>> {
        const checkpoint = await this.checkpointer.load<RoutineGeneratorState>(threadId);
        
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

        state.approved = input?.approved ?? false;
        state.status = 'running';
        
        if (state.approved) {
            state.currentNode = 'saveRoutine';
        } else {
            state.currentNode = 'end';
        }

        logger.info('Resuming execution', { threadId, approved: state.approved });

        return this.execute({ date: state.date }, { threadId, maxRetries: 3, requiresHumanApproval: true });
    }

    async getStatus(threadId: string): Promise<{ status: string; state: RoutineGeneratorState }> {
        const checkpoint = await this.checkpointer.load<RoutineGeneratorState>(threadId);
        
        if (!checkpoint) {
            throw new AppError('Thread de ejecución no encontrado', 404);
        }

        return {
            status: checkpoint.state.status,
            state: checkpoint.state
        };
    }

    async cancel(threadId: string): Promise<void> {
        const checkpoint = await this.checkpointer.load<RoutineGeneratorState>(threadId);
        
        if (!checkpoint) {
            throw new AppError('Thread de ejecución no encontrado', 404);
        }

        checkpoint.state.status = 'failed';
        checkpoint.state.error = 'Execution cancelled by user';
        
        await this.checkpointer.save(threadId, checkpoint.state, checkpoint.state.currentNode, 'routine_generator');
        logger.info('Execution cancelled', { threadId });
    }

    // Node implementations

    private async analyzerNode(state: RoutineGeneratorState): Promise<RoutineGeneratorState> {
        logger.info('Executing analyzer node', { threadId: state.threadId, date: state.date });

        const targetDate = new Date(state.date);
        const yesterday = new Date(targetDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        logger.info('Fetching daily summary for yesterday', { threadId: state.threadId, yesterday: yesterdayStr });

        try {
            const summary = await this.repositories.get(DailySummaryRepository).findByDate(yesterdayStr);

            if (summary) {
                state.yesterdayContext = `Resumen del día anterior (${yesterdayStr}):
${summary.summary}

Nivel de riesgo: ${summary.riskLevel}/10
Puntos clave: ${summary.keyInsights.join(', ')}`;

                state.analysisResult = {
                    riskLevel: summary.riskLevel,
                    recommendations: summary.keyInsights.map(insight => `Considerar: ${insight}`)
                };

                logger.info('Analysis result from yesterday summary', { 
                    threadId: state.threadId, 
                    riskLevel: summary.riskLevel,
                    recommendationsCount: state.analysisResult.recommendations.length
                });
            } else {
                state.yesterdayContext = 'No hay datos previos.';
                state.analysisResult = {
                    riskLevel: 5,
                    recommendations: ['Establecer rutina básica de bienestar']
                };

                logger.info('No previous summary found, using defaults', { threadId: state.threadId });
            }

            return {
                ...state,
                currentNode: 'scheduler',
                updatedAt: new Date()
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            logger.error('Database error while fetching daily summary', {
                threadId: state.threadId,
                yesterday: yesterdayStr,
                error: errorMessage
            });
            
            throw new AppError(
                'Database temporarily unavailable - failed to fetch daily summary',
                500
            );
        }
    }

    private async schedulerNode(state: RoutineGeneratorState, maxRetries: number): Promise<RoutineGeneratorState> {
        logger.info('Executing scheduler node', { threadId: state.threadId, retryCount: state.retryCount });

        if (!state.analysisResult) {
            throw new Error('Cannot schedule without analysis result');
        }

        // Sanitize context and recommendations before sending to LLM
        const sanitizedContext = sanitizeInput(state.yesterdayContext);
        const sanitizedRecommendations = state.analysisResult.recommendations.map(r => sanitizeInput(r));

        const prompt = `
Actúa como un "Generador de Rutinas" para la recuperación y salud emocional.

Fecha objetivo: ${state.date}
Contexto del día anterior:
${sanitizedContext}

Nivel de riesgo: ${state.analysisResult.riskLevel}/10
Recomendaciones:
${sanitizedRecommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Genera una rutina diaria en formato JSON con las siguientes características:
1. Debe incluir actividades que promuevan el bienestar y la recuperación
2. Las actividades deben estar ordenadas cronológicamente
3. Cada actividad debe tener: time (formato HH:MM), activity (descripción), expectedBenefit (beneficio esperado)
4. Incluye al menos 3 actividades distribuidas a lo largo del día

Formato JSON estricto:
{
  "activities": [
    {
      "time": "08:00",
      "activity": "Meditación matutina",
      "expectedBenefit": "Reducir ansiedad y comenzar el día con calma"
    }
  ]
}

Devuelve SOLO el JSON, sin texto adicional.
`;

        const messages: ChatMessage[] = [
            { role: 'system', content: 'Eres un generador de rutinas de salud mental. Devuelve solo JSON válido.' },
            { role: 'user', content: prompt },
        ];

        try {
            const response = await this.llmProvider.generateResponse(messages);
            const schedule = JsonParser.parseSafe(response, null);

            if (!schedule) {
                logger.warn('JSON parsing failed', { 
                    threadId: state.threadId, 
                    rawResponse: response,
                    retryCount: state.retryCount
                });
                throw new Error('Failed to parse LLM response as JSON');
            }

            logger.info('Schedule generated', { threadId: state.threadId, activitiesCount: schedule.activities?.length });

            return {
                ...state,
                rawSchedule: schedule,
                currentNode: 'validator',
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
                    error: `Scheduler failed after ${maxRetries} retries: ${errorMessage}`,
                    retryCount: newRetryCount,
                    updatedAt: new Date()
                };
            }

            // Exponential backoff with jitter, capped at 10 seconds
            const baseBackoffMs = Math.pow(2, newRetryCount) * 1000;
            const jitterMs = Math.random() * 1000;
            const backoffMs = Math.min(10000, baseBackoffMs + jitterMs);
            
            logger.warn('Scheduler falló, reintentando con backoff exponencial', { 
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

    private validateSchedule(rawSchedule: any): { isValid: boolean; feedback: string } {
        if (!rawSchedule || typeof rawSchedule !== 'object') {
            return { isValid: false, feedback: 'El schedule debe ser un objeto JSON válido' };
        }

        if (!rawSchedule.hasOwnProperty('activities')) {
            return { isValid: false, feedback: "Falta el campo 'activities' en el schedule" };
        }

        if (!Array.isArray(rawSchedule.activities)) {
            return { isValid: false, feedback: "El campo 'activities' debe ser un array" };
        }

        if (rawSchedule.activities.length === 0) {
            return { isValid: false, feedback: 'El array de activities está vacío' };
        }

        for (let i = 0; i < rawSchedule.activities.length; i++) {
            const activity = rawSchedule.activities[i];

            if (!activity.hasOwnProperty('time')) {
                return { isValid: false, feedback: `La actividad ${i + 1} no tiene el campo 'time'` };
            }

            const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(activity.time)) {
                return { isValid: false, feedback: `La actividad ${i + 1} tiene un formato de tiempo inválido. Usa HH:MM (ej: 08:00)` };
            }

            if (!activity.hasOwnProperty('activity')) {
                return { isValid: false, feedback: `La actividad ${i + 1} no tiene el campo 'activity'` };
            }

            if (typeof activity.activity !== 'string' || activity.activity.length < 3) {
                return { isValid: false, feedback: `La actividad ${i + 1} tiene una descripción demasiado corta (mínimo 3 caracteres)` };
            }

            if (!activity.hasOwnProperty('expectedBenefit')) {
                return { isValid: false, feedback: `La actividad ${i + 1} no tiene el campo 'expectedBenefit'` };
            }
        }

        const times = rawSchedule.activities.map((a: any) => a.time);
        for (let i = 1; i < times.length; i++) {
            if (times[i] < times[i - 1]) {
                return { isValid: false, feedback: 'Las actividades deben estar en orden cronológico' };
            }
        }

        if (rawSchedule.activities.length < 3) {
            return { isValid: false, feedback: 'El schedule debe tener al menos 3 actividades' };
        }

        return { isValid: true, feedback: '' };
    }

    private async validatorNode(state: RoutineGeneratorState): Promise<RoutineGeneratorState> {
        logger.info('Executing validator node', { 
            threadId: state.threadId, 
            validationAttempts: state.validationAttempts 
        });

        if (!state.rawSchedule) {
            throw new Error('Cannot validate without raw schedule');
        }

        const validationResult = this.validateSchedule(state.rawSchedule);
        const newValidationAttempts = state.validationAttempts + 1;

        if (validationResult.isValid) {
            logger.info('Schedule validation passed', { 
                threadId: state.threadId, 
                attempts: newValidationAttempts 
            });

            return {
                ...state,
                validatedSchedule: state.rawSchedule,
                validationAttempts: newValidationAttempts,
                currentNode: 'formatter',
                updatedAt: new Date()
            };
        } else {
            logger.warn('Schedule validation failed', { 
                threadId: state.threadId, 
                attempts: newValidationAttempts,
                feedback: validationResult.feedback
            });

            if (newValidationAttempts >= 3) {
                logger.error('Max validation attempts exceeded', { threadId: state.threadId });
                return {
                    ...state,
                    status: 'failed',
                    error: `Schedule validation failed after 3 attempts. Last error: ${validationResult.feedback}`,
                    validationAttempts: newValidationAttempts,
                    updatedAt: new Date()
                };
            }

            if (!state.analysisResult) {
                throw new Error('Analysis result is missing');
            }

            const updatedRecommendations = [
                ...state.analysisResult.recommendations,
                `CORRECCIÓN NECESARIA: ${validationResult.feedback}`
            ];

            return {
                ...state,
                analysisResult: {
                    ...state.analysisResult,
                    recommendations: updatedRecommendations
                },
                validationAttempts: newValidationAttempts,
                currentNode: 'scheduler',
                updatedAt: new Date()
            };
        }
    }

    private async formatterNode(state: RoutineGeneratorState): Promise<RoutineGeneratorState> {
        logger.info('Executing formatter node', { threadId: state.threadId });

        if (!state.validatedSchedule) {
            throw new Error('Cannot format without validated schedule');
        }

        const activities = state.validatedSchedule.activities.map((activity: any) => ({
            time: activity.time,
            activity: activity.activity,
            expectedBenefit: activity.expectedBenefit
        }));

        logger.info('Routine formatted', { 
            threadId: state.threadId, 
            activitiesCount: activities.length 
        });

        return {
            ...state,
            formattedRoutine: { activities },
            currentNode: 'checkApproval',
            updatedAt: new Date()
        };
    }

    private async checkApprovalNode(
        state: RoutineGeneratorState,
        requiresHumanApproval: boolean
    ): Promise<RoutineGeneratorState> {
        logger.info('Executing checkApproval node', { 
            threadId: state.threadId, 
            requiresHumanApproval 
        });

        if (requiresHumanApproval) {
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
            currentNode: 'saveRoutine',
            updatedAt: new Date()
        };
    }

    private async saveRoutineNode(state: RoutineGeneratorState): Promise<RoutineGeneratorState> {
        logger.info('Executing saveRoutine node', { threadId: state.threadId });

        if (state.requiresApproval && !state.approved) {
            logger.info('Routine not saved - not approved', { threadId: state.threadId });
            return {
                ...state,
                currentNode: 'end',
                status: 'completed',
                updatedAt: new Date()
            };
        }

        if (!state.formattedRoutine) {
            throw new Error('Cannot save routine without formatted routine');
        }

        try {
            await this.repositories.get(RoutineRepository).save({
                targetDate: state.date,
                activities: state.formattedRoutine.activities
            });

            logger.info('Routine saved', { threadId: state.threadId });

            return {
                ...state,
                currentNode: 'end',
                status: 'completed',
                updatedAt: new Date()
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
            logger.error('Database error while saving routine', { 
                threadId: state.threadId, 
                error: errorMessage
            });
            
            throw new AppError(
                'Database temporarily unavailable - failed to save routine',
                500
            );
        }
    }

    private createInitialState(date: string, threadId: string): RoutineGeneratorState {
        return {
            threadId,
            status: 'running',
            currentNode: 'start',
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            date,
            yesterdayContext: '',
            analysisResult: null,
            rawSchedule: null,
            validatedSchedule: null,
            formattedRoutine: null,
            validationAttempts: 0,
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
            .recordExecution(threadId, 'routine_generator', status, durationMs, retryCount, input, output, error)
            .catch((err) => {
                logger.error('Failed to record metrics asynchronously', {
                    threadId,
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            });
    }
}
