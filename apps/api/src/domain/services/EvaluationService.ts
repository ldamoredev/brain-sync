import { LLMProvider } from '../../application/providers/LLMProvider';
import { JsonParser } from '../../application/utils/JsonParser';
import { ChatMessage } from '@brain-sync/types';

export interface EvaluationResult {
    isFaithful: boolean;
    reasoning: string;
    correctedAnswer?: string;
}

export class EvaluationService {
    constructor(private llmProvider: LLMProvider) {}

    async evaluateFaithfulness(
        question: string,
        context: string,
        answer: string
    ): Promise<EvaluationResult> {
        const prompt = `
        Actúa como un crítico de rigor y veracidad para un asistente de salud mental.
        Tu tarea es evaluar si la RESPUESTA del asistente es fiel al CONTEXTO proporcionado y si no inventa información.

        CONTEXTO:
        ${context}

        PREGUNTA DEL USUARIO:
        ${question}

        RESPUESTA A EVALUAR:
        ${answer}

        REGLAS DE EVALUACIÓN:
        1. La respuesta debe basarse ÚNICAMENTE en el contexto.
        2. Si la respuesta contiene información que NO está en el contexto, se considera NO fiel (isFaithful: false).
        3. Si el asistente dice "No tengo esa información" y efectivamente no está en el contexto, se considera fiel (isFaithful: true).
        4. No evalúes el tono, solo la veracidad respecto al contexto.

        Devuelve SOLO un objeto JSON con esta estructura:
        {
            "isFaithful": boolean,
            "reasoning": "Explicación breve de por qué es fiel o no",
            "correctedAnswer": "Si no es fiel, proporciona una versión corregida que solo use el contexto. Si es fiel, deja este campo vacío o null."
        }
        `;

        const messages: ChatMessage[] = [
            { role: 'system', content: 'Eres un evaluador de veracidad RAG. Responde solo en JSON.' },
            { role: 'user', content: prompt }
        ];

        try {
            const response = await this.llmProvider.generateResponse(messages);
            const parsed = JsonParser.parseSafe<any>(response, {});

            return {
                isFaithful: !!parsed.isFaithful,
                reasoning: parsed.reasoning || "Sin razonamiento proporcionado",
                correctedAnswer: parsed.correctedAnswer || undefined
            };
        } catch (error) {
            console.error("Error in EvaluationService:", error);
            return {
                isFaithful: true, // Default to true if evaluation fails to avoid blocking
                reasoning: "Error durante la evaluación",
            };
        }
    }

    async calculateRagasMetrics(
        question: string,
        context: string,
        answer: string
    ): Promise<{ faithfulness: number; answerRelevance: number }> {
        const prompt = `
        Evalúa las siguientes métricas para una respuesta de RAG en una escala de 0.0 a 1.0.
        
        CONTEXTO:
        ${context}
        
        PREGUNTA:
        ${question}
        
        RESPUESTA:
        ${answer}
        
        MÉTRICAS:
        1. Faithfulness (Veracidad): ¿La respuesta se basa únicamente en el contexto y no inventa nada?
        2. Answer Relevance (Relevancia): ¿Qué tan bien responde la respuesta a la pregunta del usuario?
        
        Devuelve SOLO JSON:
        {
            "faithfulness": float,
            "answerRelevance": float,
            "reasoning": "Breve explicación"
        }
        `;

        const messages: ChatMessage[] = [
            { role: 'system', content: 'Eres un evaluador métrico de RAG. Responde solo en JSON.' },
            { role: 'user', content: prompt }
        ];

        try {
            const response = await this.llmProvider.generateResponse(messages);
            const parsed = JsonParser.parseSafe<any>(response, {});
            return {
                faithfulness: parsed.faithfulness ?? 0,
                answerRelevance: parsed.answerRelevance ?? 0
            };
        } catch (e) {
            return { faithfulness: 0, answerRelevance: 0 };
        }
    }
}
