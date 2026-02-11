// apps/api/src/application/services/ChatService.ts

import { ChatResponse } from '@brain-sync/types';
import { VectorProvider } from '../providers/VectorProvider';
import { ChatMessage, LLMProvider } from '../providers/LLMProvider';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { GraphRepository } from '../../domain/entities/GraphRepository';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class ChatService {
    constructor(
        private repositories: RepositoryProvider,
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
        // Usamos un umbral de 0.5 para filtrar ruido
        const similarNotes = await this.repositories.get(NoteRepository).findSimilar(queryVector, 5, 0.5);

        // 3. Si no hay notas, respondemos preventivamente
        if (similarNotes.length === 0) {
            return {
                answer: 'No tengo notas guardadas que puedan responder a eso. ¿Quieres que guarde algo nuevo?',
                contextUsed: [],
            };
        }

        // 4. GraphRAG: Find contextual relationships
        const noteIds = similarNotes.map(n => n.id);
        const graphContext = await this.repositories.get(GraphRepository).findContextualRelationships(noteIds);
        
        const graphContextString = graphContext.length > 0
            ? `\n\nRELACIONES ENCONTRADAS (GraphRAG):\n${graphContext.map(r => `- ${r.source} ${r.type} ${r.target}`).join('\n')}`
            : '';

        // 5. Construir el contexto para "anclar" (Grounding) al modelo
        const context = similarNotes.map((n, i) => `[Nota ${i + 1}]: ${n.content}`).join('\n\n') + graphContextString;

        // 6. Preparar los mensajes siguiendo la abstracción del LLMProvider
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `Eres un asistente de notas personales. 
        Responde la pregunta del usuario basándote ÚNICAMENTE en el siguiente contexto.
        
        CONTEXTO:
        ${context}
        
        INSTRUCCIONES:
        - Si la respuesta no está en el contexto, indica que no tienes esa información.
        - Cita la fuente usando [Nota X] si es posible.
        - Usa las "RELACIONES ENCONTRADAS" para explicar causas y efectos si es relevante.
        - No mezcles información de diferentes notas si hablan de entidades distintas.`,
            },
            {
                role: 'user',
                content: question,
            },
        ];

        // 7. Generar la respuesta usando la IA inyectada
        const answer = await this.llmProvider.generateResponse(messages);

        // 8. Devolver la respuesta estructurada con las fuentes
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
        // Usamos un umbral de 0.5 para filtrar ruido
        const similarNotes = await this.repositories.get(NoteRepository).findSimilar(queryVector, 5, 0.5);

        if (signal?.aborted) return;

        if (onSourcesFound) {
            onSourcesFound(similarNotes.map(n => ({ id: n.id, content: n.content })));
        }

        // 2. GraphRAG: Find contextual relationships
        const noteIds = similarNotes.map(n => n.id);
        const graphContext = await this.repositories.get(GraphRepository).findContextualRelationships(noteIds);
        
        const graphContextString = graphContext.length > 0
            ? `\n\nRELACIONES ENCONTRADAS (GraphRAG):\n${graphContext.map(r => `- ${r.source} ${r.type} ${r.target}`).join('\n')}`
            : '';

        // 3. Construir el contexto
        const context = similarNotes.length > 0
            ? similarNotes.map((n, i) => `[Nota ${i + 1}]: ${n.content}`).join('\n\n') + graphContextString
            : 'No hay notas relacionadas en la base de datos.';

        // 4. Preparar prompt para el LLM
        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: `Eres un asistente personal. Responde basándote en este contexto:\n\n${context}\n\nSi hay múltiples notas, trata cada una como una fuente distinta. Usa las relaciones del grafo para conectar ideas.`
            },
            { role: 'user', content: question },
        ];

        if (signal?.aborted) return;

        // 5. Obtener el stream del proveedor (Ollama)
        const stream = this.llmProvider.generateStream(messages);

        // 6. Emitir cada fragmento
        for await (const chunk of stream) {
            if (signal?.aborted) return;
            yield chunk;
        }
    }
}
