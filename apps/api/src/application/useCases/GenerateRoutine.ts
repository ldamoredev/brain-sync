import { LLMProvider, ChatMessage } from '../providers/LLMProvider';
import { DailySummaryRepository } from '../../domain/entities/DailySummaryRepository';
import { RoutineRepository } from '../../domain/entities/RoutineRepository';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class GenerateRoutine {
    constructor(
        private llmProvider: LLMProvider,
        private repositories: RepositoryProvider,
    ) {}

    async execute(date: string): Promise<void> {
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
