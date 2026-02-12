import { ChatResponse, ChatStreamChunk } from '@brain-sync/types';
import { VectorProvider } from '../providers/VectorProvider';
import { ChatMessage, LLMProvider } from '../providers/LLMProvider';
import { NoteRepository } from '../../domain/entities/NoteRepository';
import { GraphRepository } from '../../domain/entities/GraphRepository';
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';
import { EvaluationService } from '../../domain/services/EvaluationService';

export class Chat {
    constructor(
        private repositories: RepositoryProvider,
        private vectorProvider: VectorProvider,
        private llmProvider: LLMProvider,
        private evaluationService?: EvaluationService
    ) {
    }

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
                isFaithful: true
            };
        }

        // 2. GraphRAG: Find contextual relationships
        const noteIds = similarNotes.map(n => n.id);
        const graphContext = await this.repositories.get(GraphRepository).findContextualRelationships(noteIds);

        const graphContextString = graphContext.length > 0
            ? `\n\nRELACIONES ENCONTRADAS (GraphRAG):\n${graphContext.map(r => `- ${r.source} ${r.type} ${r.target}`).join('\n')}`
            : '';

        // 3. Construir el contexto para "anclar" (Grounding) al modelo
        const context = similarNotes.map((n, i) => `[Nota ${i + 1}]: ${n.content}`).join('\n\n') + graphContextString;

        // 4. Preparar los mensajes siguiendo la abstracción del LLMProvider
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

        // 5. Generar la respuesta usando la IA inyectada
        let answer = await this.llmProvider.generateResponse(messages);
        let isFaithful = true;
        let metrics: { faithfulness: number; answerRelevance: number } | undefined;

        // 6. Evaluación de veracidad (Phase 5: Evaluation & Observability)
        if (this.evaluationService) {
            const evaluation = await this.evaluationService.evaluateFaithfulness(question, context, answer);
            isFaithful = evaluation.isFaithful;
            if (!evaluation.isFaithful && evaluation.correctedAnswer) {
                console.log(`[Eval] La respuesta original no era fiel al contexto. Corrigiendo...`);
                console.log(`[Eval] Razonamiento: ${evaluation.reasoning}`);
                answer = evaluation.correctedAnswer;
                isFaithful = true; // Once corrected, we consider it faithful
            }

            // Calculate RAGas metrics for observability
            metrics = await this.evaluationService.calculateRagasMetrics(question, context, answer);
        }

        // 7. Devolver la respuesta estructurada con las fuentes
        return {
            answer,
            isFaithful,
            metrics,
            contextUsed: similarNotes.map(n => ({
                id: n.id,
                content: n.content,
            })),
        };
    }

    async* askStream(question: string, options?: {
        signal?: AbortSignal
    }): AsyncIterable<ChatStreamChunk> {
        const signal = options?.signal;

        // 1. RAG: Buscar notas relevantes
        const queryVector = await this.vectorProvider.generateEmbedding(question);
        // Usamos un umbral de 0.5 para filtrar ruido
        const similarNotes = await this.repositories.get(NoteRepository).findSimilar(queryVector, 5, 0.5);

        if (signal?.aborted) return;

        yield { type: 'meta', sources: similarNotes.map(n => ({ id: n.id, content: n.content })) };

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
            { role: 'user', content: question },
        ];

        if (signal?.aborted) return;

        // 5. Obtener el stream del proveedor (Ollama)
        const stream = this.llmProvider.generateStream(messages);

        // 6. Emitir cada fragmento
        let fullAnswer = '';
        for await (const chunk of stream) {
            if (signal?.aborted) return;
            fullAnswer += chunk;
            yield { type: 'token', content: chunk };
        }

        // 7. Evaluación diferida (Phase 5: Evaluation & Observability)
        if (this.evaluationService && fullAnswer) {
            try {
                const evaluation = await this.evaluationService.evaluateFaithfulness(question, context, fullAnswer);
                yield { type: 'eval', isFaithful: evaluation.isFaithful, reasoning: evaluation.reasoning };
                
                if (!evaluation.isFaithful) {
                    console.warn(`[Eval-Stream] Alerta de veracidad: La respuesta enviada podría contener alucinaciones.`);
                    console.warn(`[Eval-Stream] Razonamiento: ${evaluation.reasoning}`);
                }
            } catch (err) {
                console.error("[Eval-Stream] Error en evaluación:", err);
            }
        }
        
        yield { type: 'done' };
    }
}
