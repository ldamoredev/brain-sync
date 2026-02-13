import { LLMProvider } from '../providers/LLMProvider';
import { DailySummaryRepository } from '../../domain/entities/DailySummaryRepository';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';
import { ChatMessage } from '@brain-sync/types';
import { JsonParser } from '../utils/JsonParser';

export class GenerateDailyAudit {
    constructor(
        private llmProvider: LLMProvider,
        private repositories: RepositoryProvider,
    ) {
    }

    async execute(date: string): Promise<void> {
        const dayNotes = await this.getNotesForDay(date);

        if (dayNotes.length === 0) return;

        const context = dayNotes.map(n => n.content).join('\n\n');
        const analysis = await this.analyzeNotes(context);

        if (analysis) {
            await this.saveSummary(date, analysis);
        }
    }

    private async getNotesForDay(date: string) {
        const allNotes = await this.repositories.get(NoteRepository).findAll();
        return allNotes.filter(n => {
            const noteDate = new Date(n.createdAt).toISOString().split('T')[0];
            return noteDate === date;
        });
    }

    private async analyzeNotes(context: string): Promise<any> {
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
            { role: 'user', content: prompt },
        ];

        try {
            const response = await this.llmProvider.generateResponse(messages);
            return JsonParser.parseSafe(response, null);
        } catch (e) {
            console.error('Failed to communicate with LLM for daily audit', e);
            return null;
        }
    }

    private async saveSummary(date: string, analysis: any) {
        try {
            await this.repositories.get(DailySummaryRepository).save({
                date,
                summary: analysis.summary || 'Resumen no disponible',
                riskLevel: analysis.riskLevel || 1,
                keyInsights: analysis.keyInsights || [],
            });
        } catch (e) {
            console.error('Failed to save daily summary', e);
        }
    }
}
