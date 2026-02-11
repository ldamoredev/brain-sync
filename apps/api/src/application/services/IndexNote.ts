import { Note } from '../../domain/entities/Note';
import type { VectorProvider } from '../providers/VectorProvider';
import { randomUUID } from 'crypto';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { JournalAnalysisService } from './JournalAnalysisService';
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
        if (content.length < 5) {
            throw new Error("El contenido de la nota es demasiado corto.");
        }

        // 1. Generate Embedding
        const embedding = await this.vectorProvider.generateEmbedding(content);

        const note = new Note(
            randomUUID(),
            content,
            embedding,
            new Date()
        );

        // 2. Save Note
        await this.repositories.get(NoteRepository).save(note);

        // 3. Analyze Content (Behavioral Intelligence)
        try {
            const analysis = await this.analysisService.analyze(content);

            // Save Entities and capture their IDs
            const savedEmotions = await this.repositories.get(BehaviorRepository).saveEmotions(
                analysis.emotions.map(e => ({ noteId: note.id, emotion: e.name, intensity: e.intensity }))
            );

            const savedTriggers = await this.repositories.get(BehaviorRepository).saveTriggers(
                analysis.triggers.map(t => ({ noteId: note.id, description: t.description, category: t.category }))
            );

            const savedActions = await this.repositories.get(BehaviorRepository).saveActions(
                analysis.actions.map(a => ({ noteId: note.id, action: a.description, outcomeType: a.type }))
            );

            // Combine all saved entities into a single lookup map
            // Key: Description (lowercase), Value: ID
            const entityMap = new Map<string, string>();
            
            [...savedEmotions, ...savedTriggers, ...savedActions].forEach(entity => {
                entityMap.set(entity.description.toLowerCase(), entity.id);
            });

            // 4. Build Graph (Save Relationships)
            for (const rel of analysis.relationships) {
                const sourceId = entityMap.get(rel.source.toLowerCase());
                const targetId = entityMap.get(rel.target.toLowerCase());

                if (sourceId && targetId) {
                    await this.repositories.get(GraphRepository).createRelationship({
                        sourceId,
                        targetId,
                        type: rel.type,
                        weight: 1 // Default weight
                    });
                } else {
                    console.warn(`Could not link entities: "${rel.source}" -> "${rel.target}". One or both not found in saved entities.`);
                }
            }

        } catch (error) {
            console.error("Error analyzing note:", error);
        }

        return note;
    }
}
