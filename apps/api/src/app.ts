import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { Controller } from './infrastructure/http/interfaces/Controller';
import { errorHandler } from './infrastructure/http/middleware/errorHandler';

export class App {
    public app: express.Application;

    constructor(controllers: Controller[]) {
        this.app = express();

        this.initializeMiddlewares();
        this.initializeControllers(controllers);
        this.initializeErrorHandling();
    }

    private initializeMiddlewares() {
        this.app.use(helmet());
        this.app.use(express.json());
        
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            limit: 100, // Limit each IP to 100 requests per windowMs
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use(limiter);

        this.app.use(cors({
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
        }));
    }

    private initializeControllers(controllers: Controller[]) {
        controllers.forEach((controller) => {
            this.app.use('/', controller.router);
        });
    }

    private initializeErrorHandling() {
        this.app.use(errorHandler);
    }

    public listen() {
        const port = process.env.PORT || 6060;
        this.app.listen(port, () => {
            console.log(`🚀 Server running on http://localhost:${port}`);
        });
    }
}
