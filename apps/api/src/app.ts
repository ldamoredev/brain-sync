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
import { Chat } from './application/useCases/chat/Chat';
import { IndexNote } from './application/useCases/IndexNote';
import { GenerateDailyAudit } from './application/useCases/GenerateDailyAudit';
import { TranscriptAudio } from './application/useCases/TranscriptAudio';
import { GetNotes } from './application/useCases/GetNotes';
import { GetAgentData } from './application/useCases/GetAgentData';
import { GenerateRoutine } from './application/useCases/GenerateRoutine';

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
        const chatController = new ChatController(this.core.getUseCase(Chat));
        const noteController = new NoteController(this.core.getUseCase(IndexNote), this.core.getUseCase(GetNotes));
        const transcriptionController = new TranscriptionController(this.core.getUseCase(TranscriptAudio));
        const agentController = new AgentController(
            this.core.getUseCase(GenerateDailyAudit),
            this.core.getUseCase(GenerateRoutine),
            this.core.getUseCase(GetAgentData),
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
