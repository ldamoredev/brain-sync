import { LLMProvider } from '../providers/LLMProvider';
import { DailySummaryRepository } from '../../domain/entities/DailySummaryRepository';
import { RoutineRepository } from '../../domain/entities/RoutineRepository';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';
import { ChatMessage } from '@brain-sync/types';
import { JsonParser } from '../utils/JsonParser';

export class GenerateRoutine {
    constructor(
        private llmProvider: LLMProvider,
        private repositories: RepositoryProvider,
    ) {}

    async execute(date: string): Promise<void> {
        const yesterdayContext = await this.getYesterdayContext(date);
        const routineData = await this.generateRoutineData(date, yesterdayContext);

        if (routineData) {
            const activities = this.normalizeActivities(routineData);
            await this.saveRoutine(date, activities);
        }
    }

    private async getYesterdayContext(date: string): Promise<string> {
        const yesterday = new Date(new Date(date).setDate(new Date(date).getDate() - 1)).toISOString().split('T')[0] as any;
        const summary = await this.repositories.get(DailySummaryRepository).findByDate(yesterday);

        return summary 
            ? `Resumen de ayer (Riesgo: ${summary.riskLevel}): ${summary.summary}`
            : "No hay datos previos.";
    }

    private async generateRoutineData(date: string, context: string): Promise<any> {
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

        try {
            const response = await this.llmProvider.generateResponse(messages);
            return JsonParser.parseSafe(response, null);
        } catch (e) {
            console.error("Failed to communicate with LLM for routine generation", e);
            return null;
        }
    }

    private normalizeActivities(parsed: any): any[] {
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

        return activities;
    }

    private async saveRoutine(date: string, activities: any[]) {
        try {
            await this.repositories.get(RoutineRepository).save({
                targetDate: date,
                activities: activities
            });
        } catch (e) {
            console.error("Failed to save routine", e);
        }
    }
}
