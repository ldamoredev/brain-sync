import { LLMProvider, ChatMessage } from '../providers/LLMProvider';
import { DailySummaryRepository } from '../../domain/entities/DailySummaryRepository';
import { RoutineRepository } from '../../domain/entities/RoutineRepository';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class AgenticService {
    constructor(
        private llmProvider: LLMProvider,
        private repositories: RepositoryProvider,
    ) {}

    async generateDailyAudit(date: string): Promise<void> {
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

    async generateRoutine(date: string): Promise<void> {
        // Fetch previous day's summary to inform the routine
        const yesterday = new Date(new Date(date).setDate(new Date(date).getDate() - 1)).toISOString().split('T')[0] as any;
        const summary = await this.repositories.get(DailySummaryRepository).findByDate(yesterday);

        const context = summary 
            ? `Resumen de ayer (Riesgo: ${summary.riskLevel}): ${summary.summary}`
            : "No hay datos previos.";

        const prompt = `
        Genera una rutina para el día ${date} basada en el estado de ayer.
        Contexto: ${context}

        Crea un horario estructurado para maximizar bienestar y minimizar riesgo.
        Devuelve JSON con una clave "activities" que contenga una lista de objetos.
        Cada objeto debe tener "time", "activity", y "expectedBenefit".
        
        Ejemplo de formato:
        {
            "activities": [
                {"time": "08:00", "activity": "Meditación", "expectedBenefit": "Reducir ansiedad matutina"}
            ]
        }
        `;

        const messages: ChatMessage[] = [
            { role: 'system', content: 'Eres un planificador de rutinas. Devuelve solo JSON.' },
            { role: 'user', content: prompt }
        ];

        const response = await this.llmProvider.generateResponse(messages);

        try {
            const cleanResponse = this.cleanJson(response);
            console.log("LLM Response for Routine:", cleanResponse); // Debug log
            const parsed = JSON.parse(cleanResponse);
            
            // Normalize the output structure
            let activities: any[] = [];
            
            if (Array.isArray(parsed.activities)) {
                activities = parsed.activities;
            } else if (Array.isArray(parsed.actividades)) { // Handle Spanish key
                activities = parsed.actividades.map((a: any) => ({
                    time: a.tiempo || a.time,
                    activity: a.actividad || a.activity,
                    expectedBenefit: a.beneficio_esperado || a.expectedBenefit
                }));
            } else if (parsed.morningRoutine || parsed.workday || parsed.eveningRoutine) {
                // Flatten nested structure if the LLM got creative
                const extractActivities = (obj: any) => {
                    if (!obj) return;
                    if (Array.isArray(obj.activities)) {
                        activities.push(...obj.activities);
                    }
                    Object.values(obj).forEach(val => {
                        if (typeof val === 'object' && val !== null) extractActivities(val);
                    });
                };
                extractActivities(parsed);
            }

            await this.repositories.get(RoutineRepository).save({
                targetDate: date,
                activities: activities
            });
        } catch (e) {
            console.error("Failed to generate routine", e);
            console.error("Raw response was:", response);
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
