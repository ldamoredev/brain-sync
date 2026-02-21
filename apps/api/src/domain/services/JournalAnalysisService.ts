import { LLMProvider } from '../../application/providers/LLMProvider';
import { JsonParser } from '../../application/utils/JsonParser';
import { ChatMessage } from '@brain-sync/types';

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
            const cleanJson = this.repairJson(response);
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
                    source: r.source || "",
                    target: r.target || "",
                    type: r.type || "RELATED_TO"
                })).filter((r: any) => r.source && r.target)
            };

        } catch (error) {
            console.error("Failed to parse LLM analysis:", error);
            console.error("Raw response was:", response);
            return { emotions: [], triggers: [], actions: [], relationships: [] };
        }
    }

    private repairJson(text: string): string {
        let clean = JsonParser.clean(text);

        // Handle truncated JSON more robustly
        try {
            JSON.parse(clean);
            return clean;
        } catch (e) {
            console.log(`[JournalAnalysisService] JSON.parse failed, attempting advanced repair...`);

            // Heuristic: find the last occurrence of a key value pair closure or a comma
            const lastClosingBrace = clean.lastIndexOf('}');
            const lastClosingBracket = clean.lastIndexOf(']');
            const lastComma = clean.lastIndexOf(',');

            let repairPoint = Math.max(lastClosingBrace, lastClosingBracket);

            // Special case: if it ends in a quote, it might be a truncated string
            const lastQuote = clean.lastIndexOf('"');
            if (lastQuote > repairPoint && (clean.match(/"/g) || []).length % 2 !== 0) {
                // We have an open string, try to close it
                const withClosedString = clean + '"';
                try {
                    // Re-evaluate repair point with closed string
                    const rBrace = withClosedString.lastIndexOf('}');
                    const rBracket = withClosedString.lastIndexOf(']');
                    const rPoint = Math.max(rBrace, rBracket);
                    if (rPoint !== -1) {
                         let repaired = withClosedString.substring(0, rPoint + 1);
                         // Balance and check
                         repaired = this.balanceBraces(repaired);
                         JSON.parse(repaired);
                         return repaired;
                    }
                } catch (err) {}
            }

            if (lastComma > repairPoint) {
                const substring = clean.substring(0, lastComma);
                if (substring.trim().endsWith('}') || substring.trim().endsWith(']')) {
                    repairPoint = lastComma;
                }
            }

            if (repairPoint !== -1) {
                let repaired = clean.substring(0, repairPoint + 1);
                if (repaired.endsWith(',')) {
                    repaired = repaired.substring(0, repaired.length - 1);
                }

                repaired = this.balanceBraces(repaired);

                try {
                    JSON.parse(repaired);
                    console.log(`[JournalAnalysisService] Repair successful at repairPoint ${repairPoint}.`);
                    return repaired;
                } catch (e2) {
                    console.log(`[JournalAnalysisService] Repair attempt failed: ${e2.message}`);
                }
            }

            // Fallback: strip last incomplete object
            const lastKey = Math.max(
                clean.lastIndexOf('"source"'), 
                clean.lastIndexOf('"target"'), 
                clean.lastIndexOf('"type"'), 
                clean.lastIndexOf('"description"'), 
                clean.lastIndexOf('"name"')
            );
            
            if (lastKey !== -1) {
                const lastBeforeKey = clean.substring(0, lastKey).lastIndexOf('{');
                if (lastBeforeKey !== -1) {
                    let repaired = clean.substring(0, lastBeforeKey).replace(/,\s*$/, '');
                    repaired = this.balanceBraces(repaired);
                    try {
                        JSON.parse(repaired);
                        console.log(`[JournalAnalysisService] Repair successful by stripping last incomplete object.`);
                        return repaired;
                    } catch (e3) {
                        // still failing
                    }
                }
            }
        }

        return clean;
    }

    private balanceBraces(repaired: string): string {
        const openBraces = (repaired.match(/{/g) || []).length;
        const closeBraces = (repaired.match(/}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/]/g) || []).length;

        let result = repaired;
        for(let i=0; i < openBrackets - closeBrackets; i++) {
            result += ']';
        }
        for(let i=0; i < openBraces - closeBraces; i++) {
            result += '}';
        }
        return result;
    }
}
