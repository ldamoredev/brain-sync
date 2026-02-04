// apps/api/src/application/services/ChatService.ts

import { ChatResponse } from '@brain-sync/types';
import { VectorProvider } from '../providers/VectorProvider';
import { ChatMessage, LLMProvider } from '../providers/LLMProvider';
import { NoteRepository } from '../../domain/entities/NoteRepository';

export class ChatService {
    constructor(
        private noteRepository: NoteRepository,
        private vectorProvider: VectorProvider,
        private llmProvider: LLMProvider,
    ) {
    }

    /**
     * Procesa una pregunta del usuario usando la técnica RAG
     */
    async ask(question: string): Promise<ChatResponse> {
        // 1. Convertir la pregunta en un vector (Embedding)
        const queryVector = await this.vectorProvider.generateEmbedding(question);

        // 2. Recuperar notas relevantes de la DB (Búsqueda Vectorial)
        const similarNotes = await this.noteRepository.findSimilar(queryVector, 5);

        // 3. Si no hay notas, respondemos preventivamente
        if (similarNotes.length === 0) {
            return {
                answer: 'No tengo notas guardadas que puedan responder a eso. ¿Quieres que guarde algo nuevo?',
                contextUsed: [],
            };
        }

        // 4. Construir el contexto para "anclar" (Grounding) al modelo
        const context = similarNotes.map(n => n.content).join('\n---\n');

        // 5. Preparar los mensajes siguiendo la abstracción del LLMProvider
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `Eres un asistente de notas personales. 
        Responde la pregunta del usuario basándote ÚNICAMENTE en el siguiente contexto:
        
        ${context}
        
        Si la respuesta no está en el contexto, indica que no tienes esa información.`,
            },
            {
                role: 'user',
                content: question,
            },
        ];

        // 6. Generar la respuesta usando la IA inyectada
        const answer = await this.llmProvider.generateResponse(messages);

        // 7. Devolver la respuesta estructurada con las fuentes
        return {
            answer,
            contextUsed: similarNotes.map(n => ({
                id: n.id,
                content: n.content,
            })),
        };
    }

    async* askStream(question: string, onSourcesFound?: (sources: any[]) => void, options?: {
        signal?: AbortSignal
    }): AsyncIterable<string> {
        const signal = options?.signal;

        // 1. RAG: Buscar notas relevantes
        const queryVector = await this.vectorProvider.generateEmbedding(question);
        const similarNotes = await this.noteRepository.findSimilar(queryVector, 5);

        if (signal?.aborted) return;

        if (onSourcesFound) {
            onSourcesFound(similarNotes.map(n => ({ id: n.id, content: n.content })));
        }

        // 2. Construir el contexto
        const context = similarNotes.length > 0
            ? similarNotes.map(n => n.content).join('\n---\n')
            : 'No hay notas relacionadas en la base de datos.';

        // 3. Preparar prompt para el LLM
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `Eres un asistente personal. Responde basándote en este contexto:\n${context}`,
            },
            { role: 'user', content: question },
        ];

        if (signal?.aborted) return;

        // 4. Obtener el stream del proveedor (Ollama)
        const stream = this.llmProvider.generateStream(messages);

        // 5. Emitir cada fragmento
        for await (const chunk of stream) {
            if (signal?.aborted) return;
            yield chunk;
        }
    }
}
