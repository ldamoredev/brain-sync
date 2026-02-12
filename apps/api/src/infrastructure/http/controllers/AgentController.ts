import { Request, Response, Router } from 'express';
import { Controller } from '../interfaces/Controller';
import { GenerateDailyAudit } from '../../../application/useCases/GenerateDailyAudit';
import { GetAgentData } from '../../../application/useCases/GetAgentData';
import { GenerateRoutine } from '../../../application/useCases/GenerateRoutine';

export class AgentController implements Controller {
    public path = '/agents';
    public router = Router() as any;

    constructor(
        private generateDailyAudit: GenerateDailyAudit,
        private generateRoutineUseCase: GenerateRoutine,
        private getAgentDataService: GetAgentData
    ) {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.post(`${this.path}/audit`, this.generateAudit.bind(this));
        this.router.get(`${this.path}/audit/:date`, this.getAudit.bind(this));
        this.router.post(`${this.path}/routine`, this.generateRoutine.bind(this));
        this.router.get(`${this.path}/routine/:date`, this.getRoutine.bind(this));
        this.router.put(`${this.path}/routine/:date`, this.updateRoutine.bind(this));
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
            const summary = await this.getAgentDataService.getAudit(req.params.date as any);
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
            const routine = await this.getAgentDataService.getRoutine(req.params.date as any);
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
            await this.getAgentDataService.updateRoutine(req.params.date as any, activities);
            res.json({ message: "Routine updated successfully" });
        } catch (error) {
            next(error);
        }
    }
}
