import { LLMProvider, ChatMessage } from '../providers/LLMProvider';
import { DailySummaryRepository } from '../../domain/entities/DailySummaryRepository';
import { RoutineRepository } from '../../domain/entities/RoutineRepository';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class GenerateDailyAudit {
    constructor(
        private llmProvider: LLMProvider,
        private repositories: RepositoryProvider,
    ) {}

    async execute(date: string): Promise<void> {
        // 1. Fetch all notes from the day
        // Note: This assumes we have a method to fetch by date range, which we might need to add to NoteRepository
        // For now, let's assume we can fetch recent notes or implement a specific query later.
        // As a placeholder, we'll fetch all notes and filter in memory (inefficient but works for MVP)
        const allNotes = await this.repositories.get(NoteRepository).findAll();
        const dayNotes = allNotes.filter(n => {
            const noteDate = new Date(n.createdAt).toISOString().split('T')[0];
            return noteDate === date;
        });

        if (dayNotes.length === 0) return;

        const context = dayNotes.map(n => n.content).join('\n\n');

        const prompt = `
        Actúa como un "Auditor Diario" para la recuperación y salud emocional.
        Analiza las notas del día:
        ${context}

        Genera un resumen JSON con:
        1. "summary": Resumen narrativo del día.
        2. "riskLevel": Nivel de riesgo de recaída (1-10).
        3. "keyInsights": Lista de puntos clave observados.

        Formato JSON estricto.
        `;

        const messages: ChatMessage[] = [
            { role: 'system', content: 'Eres un auditor de salud mental. Devuelve solo JSON.' },
            { role: 'user', content: prompt }
        ];

        const response = await this.llmProvider.generateResponse(messages);
        
        try {
            const parsed = JSON.parse(this.cleanJson(response));
            await this.repositories.get(DailySummaryRepository).save({
                date,
                summary: parsed.summary || "Resumen no disponible",
                riskLevel: parsed.riskLevel || 1,
                keyInsights: parsed.keyInsights || []
            });
        } catch (e) {
            console.error("Failed to generate daily audit", e);
        }
    }

    private cleanJson(text: string): string {
        let clean = text.trim();
        if (clean.startsWith('```json')) clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        else if (clean.startsWith('```')) clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
        const first = clean.indexOf('{');
        const last = clean.lastIndexOf('}');
        if (first !== -1 && last !== -1) clean = clean.substring(first, last + 1);
        return clean;
    }
}
