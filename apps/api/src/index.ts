import 'dotenv/config';
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { DrizzleNoteRepository } from "./infrastructure/repositories/DrizzleNoteRepository";
import { ChatService } from "./application/services/ChatService";
import { ChatController } from "./infrastructure/http/controllers/ChatController";
import { IndexNote } from './application/services/IndexNote';
import { OllamaVectorProvider } from './infrastructure/providores/OllamaVectorProvider';
import { NoteController } from './infrastructure/http/controllers/IndexNoteController';
import { OllamaLLMProvider } from './infrastructure/providores/OllamaLLMProvider';
import cors from 'cors';
import { errorHandler } from './infrastructure/http/middleware/errorHandler';
import { validateRequest } from './infrastructure/http/middleware/validateRequest';
import { createNoteSchema, askQuestionSchema } from '@brain-sync/types';
import logger from './infrastructure/logger';
import { AppError } from './domain/errors/AppError';

const app = express();

// Security Middleware
app.use(helmet());
app.use(express.json());

const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
});
app.use(limiter);

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
}));

const noteRepo = new DrizzleNoteRepository();
const vectorProvider = new OllamaVectorProvider();
const LLMProvider = new OllamaLLMProvider();
const chatService = new ChatService(noteRepo, vectorProvider, LLMProvider);
const indexNote = new IndexNote(noteRepo, vectorProvider);
const chatController = new ChatController(chatService);
const indexController = new NoteController(indexNote);

app.get("/notes", async (req, res, next) => {
    try {
        const notes = await noteRepo.findAll();
        res.json(notes);
    } catch (error) {
        next(error);
    }
});

app.get("/notes/:id", async (req, res, next) => {
    try {
        const note = await noteRepo.findById(req.params.id);
        if (!note) {
            return next(new AppError('Note not found', 404));
        }
        res.json(note);
    } catch (error) {
        next(error);
    }
});

app.post("/ask", validateRequest(askQuestionSchema), (req, res, next) => chatController.handle(req, res).catch(next));
app.post("/notes", validateRequest(createNoteSchema), (req, res, next) => indexController.handle(req, res).catch(next));

// Global Error Handler
app.use(errorHandler);

const port = process.env.PORT || 6060;
app.listen(port, () => logger.info(`🚀 Server running on http://localhost:${port}`));
