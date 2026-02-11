import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { errorHandler } from './infrastructure/http/middleware/errorHandler';
import { Core } from './infrastructure/Core';
import { ChatController } from './infrastructure/http/controllers/ChatController';
import { NoteController } from './infrastructure/http/controllers/NoteController';
import { TranscriptionController } from './infrastructure/http/controllers/TranscriptionController';
import { AgentController } from './infrastructure/http/controllers/AgentController';
import { ChatService } from './application/services/ChatService';
import { IndexNote } from './application/services/IndexNote';
import { AgenticService } from './application/services/AgenticService';
import { TranscriptionService } from './application/services/TranscriptionService';
import { GetNotes } from './application/services/GetNotes';
import { GetAgentData } from './application/services/GetAgentData';

export class App {
    public app: express.Application;
    private core = new Core();

    constructor() {
        this.app = express();

        this.initializeMiddlewares();
        this.initializeControllers();
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

    private initializeControllers() {
        const chatController = new ChatController(this.core.getService(ChatService));
        const noteController = new NoteController(this.core.getService(IndexNote), this.core.getService(GetNotes));
        const transcriptionController = new TranscriptionController(this.core.getService(TranscriptionService));
        const agentController = new AgentController(
            this.core.getService(AgenticService),
            this.core.getService(GetAgentData),
        );
        const controllers = [
            chatController,
            noteController,
            transcriptionController,
            agentController
        ]
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
