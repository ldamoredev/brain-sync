import { randomUUID } from 'crypto';
import { LLMProvider } from '../providers/LLMProvider';
import { CheckpointerProvider } from '../providers/CheckpointerProvider';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { DailySummaryRepository } from '../../domain/entities/DailySummaryRepository';
import { ChatMessage } from '@brain-sync/types';
import { JsonParser } from '../utils/JsonParser';
import logger from '../../infrastructure/logger';
import { AgentGraph } from './AgentGraph';
import { DailyAuditorState, GraphConfig, GraphExecutionResult } from './types';

export class DailyAuditorGraph implements AgentGraph<DailyAuditorState, { date: string; approved?: boolean }, any> {
    constructor(
        private llmProvider: LLMProvider,
        private repositories: RepositoryProvider,
        private checkpointer: CheckpointerProvider
    ) {}

    async execute(
        input: { date: string },
        config?: GraphConfig
    ): Promise<GraphExecutionResult<DailyAuditorState>> {
        const threadId = config?.threadId || randomUUID();
        const maxRetries = config?.maxRetries ?? 3;
        const requiresHumanApproval = config?.requiresHumanApproval ?? false;

        let state: DailyAuditorState;

        // Initialize or restore state
        if (config?.threadId) {
            const checkpoint = await this.checkpointer.load<DailyAuditorState>(config.threadId);
            if (!checkpoint) {
                throw new Error(`Checkpoint not found for threadId: ${config.threadId}`);
            }
            state = checkpoint.state;
            logger.info('Restored state from checkpoint', { threadId, currentNode: state.currentNode });
        } else {
            state = this.createInitialState(input.date, threadId);
            logger.info('Created initial state', { threadId, date: input.date });
        }

        try {
            // Execute graph nodes based on currentNode
            while (state.status === 'running') {
                const previousNode = state.currentNode;

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

            return {
                success: state.status === 'completed',
                state,
                threadId,
                status: state.status,
                error: state.error
            };
        } catch (error) {
            state.status = 'failed';
            state.error = error instanceof Error ? error.message : 'Unknown error';
            await this.checkpointer.save(threadId, state, state.currentNode, 'daily_auditor');
            logger.error('Execution failed', { threadId, error: state.error });

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
            throw new Error(`Checkpoint not found for threadId: ${threadId}`);
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
        
        // If approved, continue to saveSummary, otherwise go to end
        if (state.approved) {
            state.currentNode = 'saveSummary';
        } else {
            state.currentNode = 'end';
        }

        logger.info('Resuming execution', { threadId, approved: state.approved });

        // Continue execution
        return this.execute({ date: state.date }, { threadId, maxRetries: 3, requiresHumanApproval: true });
    }

    async getStatus(threadId: string): Promise<{ status: string; state: DailyAuditorState }> {
        const checkpoint = await this.checkpointer.load<DailyAuditorState>(threadId);
        
        if (!checkpoint) {
            throw new Error(`Checkpoint not found for threadId: ${threadId}`);
        }

        return {
            status: checkpoint.state.status,
            state: checkpoint.state
        };
    }

    async cancel(threadId: string): Promise<void> {
        const checkpoint = await this.checkpointer.load<DailyAuditorState>(threadId);
        
        if (!checkpoint) {
            throw new Error(`Checkpoint not found for threadId: ${threadId}`);
        }

        checkpoint.state.status = 'failed';
        checkpoint.state.error = 'Execution cancelled by user';
        
        await this.checkpointer.save(threadId, checkpoint.state, checkpoint.state.currentNode, 'daily_auditor');
        logger.info('Execution cancelled', { threadId });
    }

    // Node implementations

    private async fetchNotesNode(state: DailyAuditorState): Promise<DailyAuditorState> {
        logger.info('Executing fetchNotes node', { threadId: state.threadId, date: state.date });

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
    }

    private async analyzeNotesNode(state: DailyAuditorState, maxRetries: number): Promise<DailyAuditorState> {
        logger.info('Executing analyzeNotes node', { threadId: state.threadId, retryCount: state.retryCount });

        const context = state.notes.map(n => n.content).join('\n\n');
        
        const prompt = `
        Actúa como un "Auditor Diario" para la recuperación y salud emocional.
        Analiza las notas del día:
        ${context}

        Genera un resumen JSON con:
        1. "summary": Resumen narrativo del día.
        2. "riskLevel": Nivel de riesgo de recaída (1-10).
        3. "keyInsights": Lista de puntos clave observados.

        Formato JSON estricto.
        `;

        const messages: ChatMessage[] = [
            { role: 'system', content: 'Eres un auditor de salud mental. Devuelve solo JSON.' },
            { role: 'user', content: prompt },
        ];

        try {
            const response = await this.llmProvider.generateResponse(messages);
            const analysis = JsonParser.parseSafe(response, null);

            if (!analysis) {
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
            
            logger.warn('Analysis failed, retrying', { 
                threadId: state.threadId, 
                retryCount: newRetryCount,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            if (newRetryCount >= maxRetries) {
                logger.error('Max retries exceeded', { threadId: state.threadId });
                return {
                    ...state,
                    status: 'failed',
                    error: `Failed to analyze notes after ${maxRetries} retries: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    retryCount: newRetryCount,
                    updatedAt: new Date()
                };
            }

            // Exponential backoff
            const backoffMs = Math.pow(2, newRetryCount) * 1000;
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
            logger.error('Failed to save summary', { 
                threadId: state.threadId, 
                error: error instanceof Error ? error.message : 'Unknown error' 
            });
            
            return {
                ...state,
                status: 'failed',
                error: `Failed to save summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
                updatedAt: new Date()
            };
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
}
