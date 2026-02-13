import { Note } from '../../domain/entities/Note';
import type { VectorProvider } from '../providers/VectorProvider';
import { randomUUID } from 'crypto';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { JournalAnalysisService } from '../../domain/services/JournalAnalysisService';
import { BehaviorRepository } from '../../domain/entities/BehaviorRepository';
import { GraphRepository } from '../../domain/entities/GraphRepository';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class IndexNote {
    constructor(
        private repositories: RepositoryProvider,
        private vectorProvider: VectorProvider,
        private analysisService: JournalAnalysisService,
    ) {}

    async execute(content: string): Promise<Note> {
        this.validateContent(content);
        const note = await this.createNote(content);

        try {
            await this.analyzeAndIndexRelationships(note);
        } catch (error) {
            console.error("Error analyzing note:", error);
        }

        return note;
    }

    private async createNote(content: string) {
        const embedding = await this.vectorProvider.generateEmbedding(content);
        const note = new Note(randomUUID(), content, embedding, new Date());
        await this.repositories.get(NoteRepository).save(note);
        return note;
    }

    private validateContent(content: string): void {
        if (content.length < 5) {
            throw new Error("El contenido de la nota es demasiado corto.");
        }
    }

    private async analyzeAndIndexRelationships(note: Note): Promise<void> {
        const analysis = await this.analysisService.analyze(note.content);

        const entityMap = await this.saveEntities(note.id, analysis);
        await this.createGraphRelationships(analysis.relationships, entityMap);
    }

    private async saveEntities(noteId: string, analysis: any): Promise<Map<string, string>> {
        const behaviorRepo = this.repositories.get(BehaviorRepository);

        const savedEmotions = await behaviorRepo.saveEmotions(
            analysis.emotions.map((e: any) => ({ noteId, emotion: e.name, intensity: e.intensity }))
        );

        const savedTriggers = await behaviorRepo.saveTriggers(
            analysis.triggers.map((t: any) => ({ noteId, description: t.description, category: t.category }))
        );

        const savedActions = await behaviorRepo.saveActions(
            analysis.actions.map((a: any) => ({ noteId, action: a.description, outcomeType: a.type }))
        );

        const entityMap = new Map<string, string>();
        [...savedEmotions, ...savedTriggers, ...savedActions].forEach(entity => {
            entityMap.set(entity.description.toLowerCase(), entity.id);
        });

        return entityMap;
    }

    private async createGraphRelationships(relationships: any[], entityMap: Map<string, string>): Promise<void> {
        const graphRepo = this.repositories.get(GraphRepository);

        for (const rel of relationships) {
            const sourceId = entityMap.get(rel.source.toLowerCase());
            const targetId = entityMap.get(rel.target.toLowerCase());

            if (sourceId && targetId) {
                await graphRepo.createRelationship({
                    sourceId,
                    targetId,
                    type: rel.type,
                    weight: 1
                });
            } else {
                console.warn(`Could not link entities: "${rel.source}" -> "${rel.target}". One or both not found in saved entities.`);
            }
        }
    }
}
