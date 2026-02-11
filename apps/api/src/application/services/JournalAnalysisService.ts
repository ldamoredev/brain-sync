import { LLMProvider, ChatMessage } from '../providers/LLMProvider';

export interface AnalysisResult {
    emotions: { name: string; intensity: number }[];
    triggers: { description: string; category: string }[];
    actions: { description: string; type: 'Positive' | 'Negative' | 'Neutral' }[];
    relationships: { source: string; target: string; type: string }[];
}

export class JournalAnalysisService {
    constructor(private llmProvider: LLMProvider) {}

    async analyze(content: string): Promise<AnalysisResult> {
        const prompt = `
        Analiza la siguiente entrada de diario y extrae datos estructurados, incluyendo las relaciones causales entre ellos.
        Devuelve SOLO un objeto JSON válido. NO incluyas markdown, explicaciones ni texto adicional.

        Estructura requerida:
        {
            "emotions": [{"name": "Ansiedad", "intensity": 8}],
            "triggers": [{"description": "Discusión con jefe", "category": "Trabajo"}],
            "actions": [{"description": "Salí a caminar", "type": "Positive"}],
            "relationships": [
                {"source": "Discusión con jefe", "target": "Ansiedad", "type": "CAUSES"},
                {"source": "Salí a caminar", "target": "Ansiedad", "type": "MITIGATES"}
            ]
        }

        REGLAS IMPORTANTES:
        1. "intensity" es OBLIGATORIO (1-10).
        2. "type" en actions solo puede ser "Positive", "Negative" o "Neutral".
        3. "relationships" debe conectar las descripciones exactas de los triggers, emotions o actions extraídos.
        4. Tipos de relación permitidos: "CAUSES", "MITIGATES", "ESCALATES", "FOLLOWED_BY".

        Entrada de Diario:
        "${content}"
        `;

        const messages: ChatMessage[] = [
            { role: 'system', content: 'Eres un API que devuelve JSON estricto. No hables, solo devuelve datos.' },
            { role: 'user', content: prompt }
        ];

        const response = await this.llmProvider.generateResponse(messages);

        try {
            let cleanJson = response.trim();
            if (cleanJson.startsWith('```json')) {
                cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
            } else if (cleanJson.startsWith('```')) {
                cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
            }
            const firstBrace = cleanJson.indexOf('{');
            const lastBrace = cleanJson.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
            }

            const parsed = JSON.parse(cleanJson);

            return {
                emotions: (parsed.emotions || []).map((e: any) => ({
                    name: e.name || "Desconocida",
                    intensity: (typeof e.intensity === 'number' && e.intensity !== null) ? e.intensity : 5
                })),
                triggers: (parsed.triggers || []).map((t: any) => ({
                    description: t.description || "Sin descripción",
                    category: t.category || "General"
                })),
                actions: (parsed.actions || []).map((a: any) => ({
                    description: a.description || "Sin descripción",
                    type: ["Positive", "Negative", "Neutral"].includes(a.type) ? a.type : "Neutral"
                })),
                relationships: (parsed.relationships || []).map((r: any) => ({
                    source: r.source,
                    target: r.target,
                    type: r.type
                }))
            };

        } catch (error) {
            console.error("Failed to parse LLM analysis:", error);
            console.error("Raw response was:", response);
            return { emotions: [], triggers: [], actions: [], relationships: [] };
        }
    }
}
