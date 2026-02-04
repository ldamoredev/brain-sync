import express from "express";
import { DrizzleNoteRepository } from "./infrastructure/repositories/DrizzleNoteRepository";
import { ChatService } from "./application/services/ChatService";
import { ChatController } from "./infrastructure/http/controllers/ChatController";
import { IndexNote } from './application/services/IndexNote';
import { OllamaVectorProvider } from './infrastructure/providores/OllamaVectorProvider';
import { NoteController } from './infrastructure/http/controllers/IndexNoteController';
import { OllamaLLMProvider } from './infrastructure/providores/OllamaLLMProvider';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors({
    origin: '*', // En desarrollo, esto te quitará todos los dolores de cabeza
    methods: ['GET', 'POST', 'OPTIONS'],
}));

const noteRepo = new DrizzleNoteRepository();
const vectorProvider = new OllamaVectorProvider();
const LLMProvider = new OllamaLLMProvider();
const chatService = new ChatService(noteRepo, vectorProvider, LLMProvider);
const indexNote = new IndexNote(noteRepo, vectorProvider);
const chatController = new ChatController(chatService);
const indexController = new NoteController(indexNote);

app.post("/ask", (req, res) => chatController.handle(req, res));

app.post("/notes", async (req, res) => indexController.handle(req, res));

app.listen(6060, () => console.log("🚀 Server running on http://localhost:6060"));