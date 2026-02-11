import 'dotenv/config';
import { App } from './app';
import { DrizzleNoteRepository } from './infrastructure/repositories/DrizzleNoteRepository';
import { ChatService } from './application/services/ChatService';
import { ChatController } from './infrastructure/http/controllers/ChatController';
import { IndexNote } from './application/services/IndexNote';
import { OllamaVectorProvider } from './infrastructure/providores/OllamaVectorProvider';
import { NoteController } from './infrastructure/http/controllers/NoteController';
import { OllamaLLMProvider } from './infrastructure/providores/OllamaLLMProvider';
import { JournalAnalysisService } from './application/services/JournalAnalysisService';
import { DrizzleBehaviorRepository } from './infrastructure/repositories/DrizzleBehaviorRepository';
import { AgenticService } from './application/services/AgenticService';
import { DrizzleDailySummaryRepository } from './infrastructure/repositories/DrizzleDailySummaryRepository';
import { DrizzleRoutineRepository } from './infrastructure/repositories/DrizzleRoutineRepository';
import { DrizzleGraphRepository } from './infrastructure/repositories/DrizzleGraphRepository';
import { TranscriptionService } from './application/services/TranscriptionService';
import { TranscriptionController } from './infrastructure/http/controllers/TranscriptionController';
import { AgentController } from './infrastructure/http/controllers/AgentController';

// Repositories
const noteRepo = new DrizzleNoteRepository();
const behaviorRepo = new DrizzleBehaviorRepository();
const dailySummaryRepo = new DrizzleDailySummaryRepository();
const routineRepo = new DrizzleRoutineRepository();
const graphRepo = new DrizzleGraphRepository();

// Providers
const vectorProvider = new OllamaVectorProvider();
const LLMProvider = new OllamaLLMProvider();

// Services
const journalAnalysisService = new JournalAnalysisService(LLMProvider);
const chatService = new ChatService(noteRepo, vectorProvider, LLMProvider, graphRepo);
const indexNote = new IndexNote(noteRepo, vectorProvider, journalAnalysisService, behaviorRepo, graphRepo);
const agenticService = new AgenticService(LLMProvider, dailySummaryRepo, routineRepo, noteRepo);
const transcriptionService = new TranscriptionService();

// Controllers
const chatController = new ChatController(chatService);
const noteController = new NoteController(indexNote, noteRepo);
const transcriptionController = new TranscriptionController(transcriptionService);
const agentController = new AgentController(agenticService, dailySummaryRepo, routineRepo);

// Initialize App
const app = new App([
    chatController,
    noteController,
    transcriptionController,
    agentController,
]);


app.listen();
