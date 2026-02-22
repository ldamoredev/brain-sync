import { Request, Response, Router } from 'express';
import { Controller } from '../interfaces/Controller';
import { GenerateDailyAudit } from '../../../application/useCases/GenerateDailyAudit';
import { GetAgentData } from '../../../application/useCases/GetAgentData';
import { GenerateRoutine } from '../../../application/useCases/GenerateRoutine';
import { DailyAuditorGraph } from '../../../application/agents/DailyAuditorGraph';
import { RoutineGeneratorGraph } from '../../../application/agents/RoutineGeneratorGraph';
import { executeDailyAuditSchema, approveExecutionSchema, generateRoutineSchema } from '@brain-sync/types';
import { validateRequest } from '../middleware/validateRequest';
import { CheckpointerProvider } from '../../../application/providers/CheckpointerProvider';
import { AppError } from '../../../domain/errors/AppError';
import { agentRateLimiter } from '../middleware/rateLimiter';
import { validateThreadOwnership } from '../../../application/utils/validateThreadOwnership';

export class AgentController implements Controller {
    public path = '/agents';
    public router = Router() as any;

    constructor(
        private generateDailyAudit: GenerateDailyAudit,
        private generateRoutineUseCase: GenerateRoutine,
        private getAgentDataService: GetAgentData,
        private dailyAuditorGraph: DailyAuditorGraph,
        private routineGeneratorGraph: RoutineGeneratorGraph,
        private checkpointer: CheckpointerProvider
    ) {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        // Apply rate limiting to all agent endpoints
        this.router.use(agentRateLimiter);
        
        this.router.post(`${this.path}/audit`, this.generateAudit.bind(this));
        this.router.get(`${this.path}/audit/:date`, this.getAudit.bind(this));
        this.router.post(`${this.path}/routine`, this.generateRoutine.bind(this));
        this.router.get(`${this.path}/routine/:date`, this.getRoutine.bind(this));
        this.router.put(`${this.path}/routine/:date`, this.updateRoutine.bind(this));
        this.router.post(`${this.path}/daily-audit`, validateRequest(executeDailyAuditSchema), this.executeDailyAudit.bind(this));
        this.router.post(`${this.path}/approve/:threadId`, validateRequest(approveExecutionSchema), this.approveExecution.bind(this));
        this.router.get(`${this.path}/status/:threadId`, this.getExecutionStatus.bind(this));
        this.router.post(`${this.path}/generate-routine`, validateRequest(generateRoutineSchema), this.executeGenerateRoutine.bind(this));
        this.router.get(`${this.path}/metrics`, this.getMetrics.bind(this));
        this.router.get(`${this.path}/health`, this.getHealth.bind(this));
    }

    async generateAudit(req: Request, res: Response, next: any) {
        try {
            const date = req.body.date || new Date().toISOString().split('T')[0];
            await this.generateDailyAudit.execute(date);
            res.json({ message: `Audit generated for ${date}` });
        } catch (error) {
            next(error);
        }
    }

    async getAudit(req: Request, res: Response, next: any) {
        try {
            const summary = await this.getAgentDataService.executeGetAudit(req.params.date as any);
            if (!summary) {
                return res.status(404).json({ message: "No audit found for this date" });
            }
            res.json(summary);
        } catch (error) {
            next(error);
        }
    }

    async generateRoutine(req: Request, res: Response, next: any) {
        try {
            const date = req.body.date || new Date().toISOString().split('T')[0];
            await this.generateRoutineUseCase.execute(date);
            res.json({ message: `Routine generated for ${date}` });
        } catch (error) {
            next(error);
        }
    }

    async getRoutine(req: Request, res: Response, next: any) {
        try {
            const routine = await this.getAgentDataService.executeGetRoutine(req.params.date as any);
            if (!routine) {
                return res.status(404).json({ message: "No routine found for this date" });
            }
            res.json(routine);
        } catch (error) {
            next(error);
        }
    }

    async updateRoutine(req: Request, res: Response, next: any) {
        try {
            const { activities } = req.body;
            if (!activities || !Array.isArray(activities)) {
                return res.status(400).json({ message: "Invalid activities format" });
            }
            await this.getAgentDataService.executeUpdateRoutine(req.params.date as any, activities);
            res.json({ message: "Routine updated successfully" });
        } catch (error) {
            next(error);
        }
    }

    async executeDailyAudit(req: Request, res: Response, next: any) {
        try {
            const { date } = req.body;
            
            const result = await this.dailyAuditorGraph.execute(
                { date },
                { requiresHumanApproval: true }
            );

            if (result.status === 'paused') {
                return res.status(202).json({
                    message: 'Análisis completado, esperando aprobación',
                    threadId: result.threadId,
                    analysis: result.state.analysis,
                    status: 'paused'
                });
            } else if (result.status === 'completed') {
                return res.status(200).json({
                    message: 'Auditoría diaria completada',
                    summary: result.state.analysis,
                    status: 'completed'
                });
            } else {
                return res.status(500).json({
                    message: 'Error al ejecutar la auditoría',
                    error: result.error,
                    status: 'failed'
                });
            }
        } catch (error) {
            next(error);
        }
    }

    async approveExecution(req: Request, res: Response, next: any) {
        try {
            const { threadId } = req.params as any;
            const { approved } = req.body as any;

            // Validate thread ownership (userId would come from auth middleware in production)
            const userId = (req as any).user?.id; // Optional for MVP
            await validateThreadOwnership(this.checkpointer, threadId, userId);

            const checkpoint = await this.checkpointer.load(threadId);
            
            if (!checkpoint) {
                throw new AppError('Thread no encontrado', 404);
            }

            const agentType = checkpoint.agentType;
            let result;

            if (agentType === 'daily_auditor') {
                result = await this.dailyAuditorGraph.resume(threadId, { approved });
            } else if (agentType === 'routine_generator') {
                result = await this.routineGeneratorGraph.resume(threadId, { approved });
            } else {
                throw new AppError('Tipo de agente desconocido', 400);
            }

            return res.status(200).json({
                message: approved ? 'Ejecución aprobada y completada' : 'Ejecución rechazada',
                status: result.status,
                threadId: result.threadId
            });
        } catch (error) {
            next(error);
        }
    }

    async getExecutionStatus(req: Request, res: Response, next: any) {
        try {
            const { threadId } = req.params as any;

            // Validate thread ownership (userId would come from auth middleware in production)
            const userId = (req as any).user?.id; // Optional for MVP
            await validateThreadOwnership(this.checkpointer, threadId, userId);

            const checkpoint = await this.checkpointer.load(threadId) as any;
            
            if (!checkpoint) {
                throw new AppError('Thread no encontrado', 404);
            }

            return res.status(200).json({
                status: checkpoint.state.status,
                currentNode: checkpoint.nodeId,
                state: checkpoint.state
            });
        } catch (error) {
            next(error);
        }
    }

    async executeGenerateRoutine(req: Request, res: Response, next: any) {
        try {
            const { date } = req.body;

            const result = await this.routineGeneratorGraph.execute(
                { date },
                { requiresHumanApproval: true }
            );

            if (result.status === 'paused') {
                return res.status(202).json({
                    message: 'Rutina generada, esperando aprobación',
                    threadId: result.threadId,
                    routine: result.state.formattedRoutine,
                    status: 'paused'
                });
            } else if (result.status === 'completed') {
                return res.status(200).json({
                    message: 'Rutina generada y guardada',
                    routine: result.state.formattedRoutine,
                    status: 'completed'
                });
            } else {
                return res.status(500).json({
                    message: 'Error al generar la rutina',
                    error: result.error,
                    status: 'failed'
                });
            }
        } catch (error) {
            next(error);
        }
    }

    async getMetrics(req: Request, res: Response, next: any) {
        try {
            const { agentType, startDate, endDate } = req.query;

            // Validate agentType if provided
            if (agentType && agentType !== 'daily_auditor' && agentType !== 'routine_generator') {
                return res.status(400).json({
                    message: 'Invalid agentType. Must be "daily_auditor" or "routine_generator"'
                });
            }

            // Build query
            const { db } = await import('../../db/index');
            const { agentMetrics } = await import('../../db/schema');
            const { eq, and, gte, lte } = await import('drizzle-orm');

            let query = db.select().from(agentMetrics);
            const conditions = [];

            if (agentType) {
                conditions.push(eq(agentMetrics.agentType, agentType as string));
            }

            if (startDate) {
                conditions.push(gte(agentMetrics.date, startDate as string));
            }

            if (endDate) {
                conditions.push(lte(agentMetrics.date, endDate as string));
            }

            if (conditions.length > 0) {
                query = query.where(and(...conditions)) as any;
            }

            const metrics = await query;

            // Calculate aggregated metrics
            const aggregated = {
                totalExecutions: metrics.reduce((sum, m) => sum + (m.totalExecutions || 0), 0),
                successfulExecutions: metrics.reduce((sum, m) => sum + (m.successfulExecutions || 0), 0),
                failedExecutions: metrics.reduce((sum, m) => sum + (m.failedExecutions || 0), 0),
                avgDurationMs: metrics.length > 0
                    ? Math.round(metrics.reduce((sum, m) => sum + (m.avgDurationMs || 0), 0) / metrics.length)
                    : 0,
                totalRetries: metrics.reduce((sum, m) => sum + (m.totalRetries || 0), 0),
                successRate: 0
            };

            if (aggregated.totalExecutions > 0) {
                aggregated.successRate = Math.round((aggregated.successfulExecutions / aggregated.totalExecutions) * 100);
            }

            return res.status(200).json({
                aggregated,
                daily: metrics
            });
        } catch (error) {
            next(error);
        }
    }

    async getHealth(req: Request, res: Response, next: any) {
        try {
            const health = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                checks: {
                    database: { status: 'unknown', message: '' },
                    llm: { status: 'unknown', message: '' }
                }
            };

            // Check database connection
            try {
                const { db } = await import('../../db/index');
                const { sql } = await import('drizzle-orm');
                await db.execute(sql`SELECT 1`);
                health.checks.database = { status: 'healthy', message: 'Database connection successful' };
            } catch (error) {
                health.checks.database = {
                    status: 'unhealthy',
                    message: error instanceof Error ? error.message : 'Database connection failed'
                };
                health.status = 'unhealthy';
            }

            // Check LLM provider availability
            try {
                // Simple check - just verify the provider is available
                // In production, you might want to do a lightweight test call
                health.checks.llm = { status: 'available', message: 'LLM provider is configured' };
            } catch (error) {
                health.checks.llm = {
                    status: 'unavailable',
                    message: error instanceof Error ? error.message : 'LLM provider check failed'
                };
                health.status = 'degraded';
            }

            const statusCode = health.status === 'healthy' ? 200 : 503;
            return res.status(statusCode).json(health);
        } catch (error) {
            next(error);
        }
    }

}
