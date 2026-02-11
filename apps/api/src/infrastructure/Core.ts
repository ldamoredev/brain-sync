import { DrizzleRepositoryProvider } from './repositories/RepositoryProvider';
import { SConstructor, ServiceProvider } from '../application/services/ServiceProvider';
import { DrizzleRoutineRepository } from './repositories/DrizzleRoutineRepository';
import { BehaviorRepository } from '../domain/entities/BehaviorRepository';
import { DrizzleBehaviorRepository } from './repositories/DrizzleBehaviorRepository';
import { DailySummaryRepository } from '../domain/entities/DailySummaryRepository';
import { DrizzleDailySummaryRepository } from './repositories/DrizzleDailySummaryRepository';
import { GraphRepository } from '../domain/entities/GraphRepository';
import { DrizzleGraphRepository } from './repositories/DrizzleGraphRepository';
import { NoteRepository } from '../domain/entities/NoteRepository';
import { DrizzleNoteRepository } from './repositories/DrizzleNoteRepository';
import { RoutineRepository } from '../domain/entities/RoutineRepository';
import { OllamaLLMProvider } from './providores/OllamaLLMProvider';
import { OllamaVectorProvider } from './providores/OllamaVectorProvider';
import { JournalAnalysisService } from '../application/services/JournalAnalysisService';
import { ChatService } from '../application/services/ChatService';
import { IndexNote } from '../application/services/IndexNote';
import { AgenticService } from '../application/services/AgenticService';
import { TranscriptionService } from '../application/services/TranscriptionService';
import { OpenIATranscriptionProvider } from './providores/OpenIATranscriptionProvider';
import { GetNotes } from '../application/services/GetNotes';
import { GetAgentData } from '../application/services/GetAgentData';

export class Core {
    public repositories = new DrizzleRepositoryProvider();
    public services = new ServiceProvider();
    private llmProvider = new OllamaLLMProvider();
    private vectorProvider = new OllamaVectorProvider();
    private transcriptionProvider = new OpenIATranscriptionProvider();

    constructor() {
        this.initializeRepositories();
        this.initializeServices();
    }

    private initializeRepositories() {
        this.repositories.register(BehaviorRepository, () => new DrizzleBehaviorRepository());
        this.repositories.register(DailySummaryRepository, () => new DrizzleDailySummaryRepository());
        this.repositories.register(GraphRepository, () => new DrizzleGraphRepository());
        this.repositories.register(NoteRepository, () => new DrizzleNoteRepository());
        this.repositories.register(NoteRepository, () => new DrizzleNoteRepository());
        this.repositories.register(RoutineRepository, () => new DrizzleRoutineRepository());
    }

    private initializeServices() {
        this.services.register(JournalAnalysisService, () => new JournalAnalysisService(this.llmProvider));
        this.services.register(ChatService, () => new ChatService(
            this.repositories,
            this.vectorProvider,
            this.llmProvider,
        ));
        this.services.register(IndexNote, () => new IndexNote(
            this.repositories,
            this.vectorProvider,
            this.services.get(JournalAnalysisService),
        ));
        this.services.register(AgenticService, () => new AgenticService(
            this.llmProvider,
            this.repositories,
        ));
        this.services.register(TranscriptionService, () => new TranscriptionService(this.transcriptionProvider));
        this.services.register(GetNotes, () => new GetNotes(this.repositories));
        this.services.register(GetAgentData, () => new GetAgentData(this.repositories));
    }

    public getService<T>(serviceType: SConstructor<T>): T {
        return this.services.get(serviceType);
    }
}