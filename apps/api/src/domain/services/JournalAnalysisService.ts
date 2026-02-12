import { LLMProvider, ChatMessage } from '../../application/providers/LLMProvider';

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
            const cleanJson = this.cleanJson(response);
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

    private cleanJson(text: string): string {
        let clean = text.trim();
        // Remove markdown code blocks if present
        if (clean.startsWith('```json')) {
            clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (clean.startsWith('```')) {
            clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // Find the first { and last }
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1) {
            clean = clean.substring(firstBrace, lastBrace + 1);
        }

        // Fix common JSON errors if it looks truncated or has trailing commas
        // 1. Remove trailing commas before closing braces/brackets
        clean = clean.replace(/,\s*([\]}])/g, '$1');

        // 2. If it's missing the closing brace but we found a first one, try to close it
        if (firstBrace !== -1 && lastBrace === -1) {
            clean += '}';
        }

        // 3. Handle truncated JSON more robustly
        try {
            JSON.parse(clean);
        } catch (e) {
            console.log(`[JournalAnalysisService] JSON.parse failed, attempting repair...`);

            // Heuristic: find the last occurrence of a key value pair closure or a comma
            // BUT, if it's an unterminated string, the repairPoint might be inside that string.
            // Let's try to find the last valid structure end.
            const lastClosingBrace = clean.lastIndexOf('}');
            const lastClosingBracket = clean.lastIndexOf(']');
            const lastComma = clean.lastIndexOf(',');

            // If it's an unterminated string error, we might have something like: "key": "value...
            // or {"key": "val

            let repairPoint = Math.max(lastClosingBrace, lastClosingBracket);

            // If the last thing is a comma after a closing brace/bracket, that's also a good place
            if (lastComma > repairPoint) {
                // Check if the comma is likely after a valid object
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

                // Now balance braces and brackets
                const openBraces = (repaired.match(/{/g) || []).length;
                const closeBraces = (repaired.match(/}/g) || []).length;
                const openBrackets = (repaired.match(/\[/g) || []).length;
                const closeBrackets = (repaired.match(/]/g) || []).length;

                for(let i=0; i < openBrackets - closeBrackets; i++) {
                    repaired += ']';
                }
                for(let i=0; i < openBraces - closeBraces; i++) {
                    repaired += '}';
                }

                try {
                    JSON.parse(repaired);
                    console.log(`[JournalAnalysisService] Repair successful at repairPoint ${repairPoint}.`);
                    return repaired;
                } catch (e2) {
                    console.log(`[JournalAnalysisService] Repair attempt failed: ${e2.message}`);
                }
            }

            // Fallback: search for the last "source", "target", or "type" and cut before it
            const lastKey = Math.max(clean.lastIndexOf('"source"'), clean.lastIndexOf('"target"'), clean.lastIndexOf('"type"'), clean.lastIndexOf('"description"'), clean.lastIndexOf('"name"'));
            if (lastKey !== -1) {
                const lastBeforeKey = clean.substring(0, lastKey).lastIndexOf('{');
                if (lastBeforeKey !== -1) {
                    let repaired = clean.substring(0, lastBeforeKey).replace(/,\s*$/, '');

                    const openBraces = (repaired.match(/{/g) || []).length;
                    const closeBraces = (repaired.match(/}/g) || []).length;
                    const openBrackets = (repaired.match(/\[/g) || []).length;
                    const closeBrackets = (repaired.match(/]/g) || []).length;

                    for(let i=0; i < openBrackets - closeBrackets; i++) {
                        repaired += ']';
                    }
                    for(let i=0; i < openBraces - closeBraces; i++) {
                        repaired += '}';
                    }
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
}
