import { ChatMessage } from '@brain-sync/types';

export class PromptBuilder {
    build(question: string, context: string): ChatMessage[] {
        return [
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
    }
}