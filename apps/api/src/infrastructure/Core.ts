import { DrizzleRepositoryProvider } from './repositories/RepositoryProvider';
import { SConstructor, UseCaseProvider } from '../application/useCases/UseCaseProvider';
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
import { JournalAnalysisService } from '../domain/services/JournalAnalysisService';
import { Chat } from '../application/useCases/Chat';
import { IndexNote } from '../application/useCases/IndexNote';
import { GenerateDailyAudit } from '../application/useCases/GenerateDailyAudit';
import { TranscriptAudio } from '../application/useCases/TranscriptAudio';
import { OpenIATranscriptionProvider } from './providores/OpenIATranscriptionProvider';
import { GetNotes } from '../application/useCases/GetNotes';
import { GetAgentData } from '../application/useCases/GetAgentData';
import { EvaluationService } from '../domain/services/EvaluationService';
import { GenerateRoutine } from '../application/useCases/GenerateRoutine';

export class Core {
    public repositories = new DrizzleRepositoryProvider();
    public useCases = new UseCaseProvider();
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
        this.useCases.register(Chat, () => new Chat(
            this.repositories,
            this.vectorProvider,
            this.llmProvider,
            new EvaluationService(this.llmProvider)
        ));
        this.useCases.register(IndexNote, () => new IndexNote(
            this.repositories,
            this.vectorProvider,
            new JournalAnalysisService(this.llmProvider),
        ));
        this.useCases.register(GenerateDailyAudit, () => new GenerateDailyAudit(
            this.llmProvider,
            this.repositories,
        ));
        this.useCases.register(GenerateRoutine, () => new GenerateRoutine(
            this.llmProvider,
            this.repositories,
        ));
        this.useCases.register(TranscriptAudio, () => new TranscriptAudio(this.transcriptionProvider));
        this.useCases.register(GetNotes, () => new GetNotes(this.repositories));
        this.useCases.register(GetAgentData, () => new GetAgentData(this.repositories));
    }

    public getUseCase<T>(serviceType: SConstructor<T>): T {
        return this.useCases.get(serviceType);
    }
}