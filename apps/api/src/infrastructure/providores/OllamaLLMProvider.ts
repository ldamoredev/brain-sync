import 'dotenv/config';
import { LLMProvider } from '../../application/providers/LLMProvider';
import { ChatOllama } from '@langchain/ollama';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatMessage } from '@brain-sync/types';
import logger from '../logger';

export class OllamaLLMProvider implements LLMProvider {
    private model: ChatOllama;

    constructor() {
        this.model = new ChatOllama({
            model: process.env.OLLAMA_MODEL || "phi3:mini",
            baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
            temperature: 0,
        });
    }

    async generateResponse(messages: ChatMessage[]): Promise<string> {
        const langChainMessages = messages.map((m) => {
            if (m.role === "system") return new SystemMessage(m.content);
            if (m.role === "assistant") return new AIMessage(m.content);
            return new HumanMessage(m.content);
        });

        const response = await this.model.invoke(langChainMessages);

        return response.content as string;
    }

    async *generateStream(messages: ChatMessage[], signal?: AbortSignal): AsyncIterable<string> {
        const langChainMessages = messages.map(m => {
            if (m.role === 'system') return new SystemMessage(m.content);
            if (m.role === 'assistant') return new AIMessage(m.content);
            return new HumanMessage(m.content);
        });

        const stream = await this.model.stream(langChainMessages, { signal });

        for await (const chunk of stream) {
            if (signal?.aborted) return;
            yield chunk.content as string;
        }
    }

    async scoreRelevance(query: string, document: string): Promise<number> {
        const prompt = `Eres un evaluador de relevancia. Debes calificar qué tan relevante es el siguiente documento para responder la consulta del usuario.

Consulta: ${query}

Documento: ${document}

Proporciona una puntuación de relevancia entre 0 y 1, donde:
- 0 = completamente irrelevante
- 0.5 = parcialmente relevante
- 1 = altamente relevante y directamente responde la consulta

Responde SOLO con un número decimal entre 0 y 1, sin texto adicional.`;

        try {
            const response = await this.model.invoke([new HumanMessage(prompt)]);
            const score = this.parseScore(response.content as string);
            
            logger.debug('scoreRelevance completed', { query: query.substring(0, 50), score });
            return score;
        } catch (error) {
            logger.error('Error in scoreRelevance', { error, query: query.substring(0, 50) });
            return 0.5;
        }
    }

    async evaluateFaithfulness(context: string, answer: string): Promise<number> {
        const prompt = `Eres un evaluador de fidelidad. Debes verificar si la respuesta está fundamentada en el contexto proporcionado.

Contexto: ${context}

Respuesta: ${answer}

Evalúa si todas las afirmaciones en la respuesta están respaldadas por el contexto. Proporciona una puntuación entre 0 y 1, donde:
- 0 = la respuesta contiene información no respaldada por el contexto
- 0.5 = la respuesta está parcialmente respaldada
- 1 = todas las afirmaciones están completamente respaldadas por el contexto

Responde SOLO con un número decimal entre 0 y 1, sin texto adicional.`;

        try {
            const response = await this.model.invoke([new HumanMessage(prompt)]);
            const score = this.parseScore(response.content as string);
            
            logger.debug('evaluateFaithfulness completed', { score });
            return score;
        } catch (error) {
            logger.error('Error in evaluateFaithfulness', { error });
            return 0.5;
        }
    }

    async evaluateAnswerRelevance(query: string, answer: string, expectedAnswer: string): Promise<number> {
        const prompt = `Eres un evaluador de relevancia de respuestas. Debes comparar la respuesta generada con la respuesta esperada.

Consulta: ${query}

Respuesta generada: ${answer}

Respuesta esperada: ${expectedAnswer}

Evalúa qué tan bien la respuesta generada aborda la consulta en comparación con la respuesta esperada. Proporciona una puntuación entre 0 y 1, donde:
- 0 = la respuesta no aborda la consulta
- 0.5 = la respuesta aborda parcialmente la consulta
- 1 = la respuesta aborda completamente la consulta de manera similar a la respuesta esperada

Responde SOLO con un número decimal entre 0 y 1, sin texto adicional.`;

        try {
            const response = await this.model.invoke([new HumanMessage(prompt)]);
            const score = this.parseScore(response.content as string);
            
            logger.debug('evaluateAnswerRelevance completed', { query: query.substring(0, 50), score });
            return score;
        } catch (error) {
            logger.error('Error in evaluateAnswerRelevance', { error, query: query.substring(0, 50) });
            return 0.5;
        }
    }

    private parseScore(response: string): number {
        const cleaned = response.trim();
        const numberMatch = cleaned.match(/\d+\.?\d*/);
        
        if (!numberMatch) {
            logger.warn('Could not parse score from LLM response', { response: cleaned });
            return 0.5;
        }
        
        const score = parseFloat(numberMatch[0]);
        
        if (isNaN(score)) {
            logger.warn('Parsed score is NaN', { response: cleaned });
            return 0.5;
        }
        
        const normalizedScore = Math.max(0, Math.min(1, score));
        
        if (normalizedScore !== score) {
            logger.warn('Score was outside [0, 1] range, clamped', { original: score, normalized: normalizedScore });
        }
        
        return normalizedScore;
    }
}
