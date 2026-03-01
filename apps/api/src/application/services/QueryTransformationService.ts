import { LLMProvider } from '../providers/LLMProvider';
import { ChatMessage } from '@brain-sync/types';

/**
 * Query intent types for classification
 */
export type QueryIntent = 'factual' | 'causal' | 'temporal' | 'comparative' | 'abstract';

/**
 * Transformed query result with intent detection and decomposition
 */
export interface TransformedQuery {
    originalQuery: string;
    intent: QueryIntent;
    subQueries: string[];
    hydeAnswer: string | null;
    timestamp: Date;
}

/**
 * QueryTransformationService
 * 
 * Analyzes and transforms user queries to improve retrieval accuracy.
 * Detects query intent, decomposes complex queries, and generates
 * hypothetical answers (HyDE) for abstract queries.
 * 
 * Requirements: Requirement 4 - Query Transformation
 */
export class QueryTransformationService {
    constructor(private llmProvider: LLMProvider) {}

    /**
     * Transforms a user query by detecting intent, decomposing if needed,
     * and generating hypothetical answers for abstract queries
     * 
     * @param query - The original user query
     * @returns TransformedQuery with all transformation results
     */
    async transform(query: string): Promise<TransformedQuery> {
        const intent = await this.detectIntent(query);
        const subQueries = await this.decomposeQuery(query);
        const hydeAnswer = intent === 'abstract' ? await this.generateHyDE(query) : null;

        return {
            originalQuery: query,
            intent,
            subQueries,
            hydeAnswer,
            timestamp: new Date()
        };
    }

    /**
     * Detects the intent of a query using LLM classification
     * Supports Spanish language queries
     * 
     * @param query - The user query to classify
     * @returns QueryIntent classification
     */
        private async detectIntent(query: string): Promise<QueryIntent> {
            try {
                const systemPrompt = `Eres un clasificador de intenciones de consultas. Tu tarea es clasificar la consulta del usuario en una de estas 5 categorías:

    1. factual: Preguntas que buscan hechos específicos o información concreta
       Ejemplos: "¿Qué es la fotosíntesis?", "¿Cuándo nació Einstein?", "¿Cuál es la capital de Francia?"

    2. causal: Preguntas sobre causas, efectos o relaciones de causa-efecto
       Ejemplos: "¿Por qué llueve?", "¿Qué provoca la inflación?", "¿Cómo afecta el ejercicio al corazón?"

    3. temporal: Preguntas sobre secuencias temporales, cronología o eventos en el tiempo
       Ejemplos: "¿Cuándo ocurrió la Segunda Guerra Mundial?", "¿Qué pasó después de la revolución?", "¿En qué orden sucedieron estos eventos?"

    4. comparative: Preguntas que comparan dos o más elementos
       Ejemplos: "¿Cuál es mejor, Android o iOS?", "¿En qué se diferencian los mamíferos de los reptiles?", "¿Qué ventajas tiene X sobre Y?"

    5. abstract: Preguntas complejas, filosóficas o conceptuales que requieren análisis profundo
       Ejemplos: "¿Qué significa la felicidad?", "¿Cómo se relaciona la tecnología con la sociedad?", "¿Cuál es el propósito de la vida?"

    Responde ÚNICAMENTE con el nombre de la categoría (factual, causal, temporal, comparative, o abstract). No agregues explicaciones ni texto adicional.`;

                const userMessage = `Clasifica esta consulta: "${query}"`;

                const messages = [
                    { role: 'system' as const, content: systemPrompt },
                    { role: 'user' as const, content: userMessage }
                ];

                // Create timeout promise
                const timeoutPromise = new Promise<string>((_, reject) => {
                    setTimeout(() => reject(new Error('Intent detection timeout')), 300);
                });

                // Race between LLM response and timeout
                const response = await Promise.race([
                    this.llmProvider.generateResponse(messages),
                    timeoutPromise
                ]);

                // Parse response to extract intent
                const cleanResponse = response.trim().toLowerCase();

                // Check for valid intent keywords
                if (cleanResponse.includes('factual')) return 'factual';
                if (cleanResponse.includes('causal')) return 'causal';
                if (cleanResponse.includes('temporal')) return 'temporal';
                if (cleanResponse.includes('comparative')) return 'comparative';
                if (cleanResponse.includes('abstract')) return 'abstract';

                // Default fallback
                return 'factual';

            } catch (error) {
                // Log error if logger is available, otherwise silently handle
                // Default to 'factual' on any error
                return 'factual';
            }
        }

    /**
     * Decomposes complex multi-part queries into sub-queries
     * Returns empty array for simple queries
     * 
     * Requirements: Requirement 4.2, Requirement 4.7
     * 
     * @param query - The user query to decompose
     * @returns Array of sub-queries (empty if query is simple)
     */
    private async decomposeQuery(query: string): Promise<string[]> {
        try {
            const systemPrompt = `Eres un analizador de consultas. Tu tarea es determinar si una consulta contiene múltiples preguntas y, si es así, descomponerla en sub-consultas independientes.

INSTRUCCIONES:
1. Si la consulta es simple (una sola pregunta), responde con: SIMPLE
2. Si la consulta contiene múltiples preguntas, descomponla en sub-consultas numeradas

EJEMPLOS:

Consulta: "¿Qué es la fotosíntesis?"
Respuesta: SIMPLE

Consulta: "¿Qué es la fotosíntesis y cómo afecta al medio ambiente?"
Respuesta:
1. ¿Qué es la fotosíntesis?
2. ¿Cómo afecta la fotosíntesis al medio ambiente?

Consulta: "¿Cuáles son las causas de la inflación, qué efectos tiene en la economía y cómo se puede controlar?"
Respuesta:
1. ¿Cuáles son las causas de la inflación?
2. ¿Qué efectos tiene la inflación en la economía?
3. ¿Cómo se puede controlar la inflación?

Responde ÚNICAMENTE con "SIMPLE" o con las sub-consultas numeradas. No agregues explicaciones adicionales.`;

            const userMessage = `Analiza esta consulta: "${query}"`;

            const messages = [
                { role: 'system' as const, content: systemPrompt },
                { role: 'user' as const, content: userMessage }
            ];

            // Execute LLM call
            const response = await this.llmProvider.generateResponse(messages);

            // Parse response
            const cleanResponse = response.trim();

            // Check if query is simple
            if (cleanResponse.toUpperCase().includes('SIMPLE')) {
                return [];
            }

            // Extract sub-queries from numbered list
            const subQueries: string[] = [];
            const lines = cleanResponse.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();
                // Match patterns like "1. Question" or "1) Question" or "1 - Question"
                const match = trimmedLine.match(/^\d+[\.\)\-\:]\s*(.+)$/);
                if (match && match[1]) {
                    const subQuery = match[1].trim();
                    if (subQuery.length > 0) {
                        subQueries.push(subQuery);
                    }
                }
            }

            // Return sub-queries if found, otherwise empty array
            return subQueries.length > 0 ? subQueries : [];

        } catch (error) {
            // On any error, return empty array (treat as simple query)
            return [];
        }
    }


    /**
     * Generates a hypothetical answer using HyDE (Hypothetical Document Embeddings)
     * Used for abstract or complex queries to improve retrieval
     * 
     * Requirements: Requirement 4.5, Requirement 4.6
     * 
     * @param query - The user query
     * @returns Hypothetical answer text
     */
        private async generateHyDE(query: string): Promise<string> {
            try {
                const systemPrompt = `Eres un asistente experto que genera respuestas hipotéticas detalladas para preguntas complejas o abstractas.

    Tu tarea es escribir una respuesta completa y bien estructurada que podría aparecer en un documento o nota personal que responda a la pregunta del usuario.

    INSTRUCCIONES:
    1. Escribe una respuesta detallada de 2-4 párrafos
    2. Usa un tono reflexivo y analítico
    3. Incluye conceptos clave y términos relevantes que podrían aparecer en documentos relacionados
    4. No uses frases como "la respuesta es" o "en conclusión" - escribe como si fuera el contenido de un documento
    5. Escribe en español de forma natural y fluida

    EJEMPLO:

    Pregunta: "¿Cómo se relaciona la tecnología con la sociedad moderna?"

    Respuesta hipotética:
    La tecnología ha transformado profundamente la estructura social contemporánea, modificando las formas de comunicación, trabajo y relaciones interpersonales. Las redes sociales y dispositivos móviles han creado una conectividad constante que redefine conceptos de privacidad y espacio público.

    En el ámbito laboral, la automatización y la inteligencia artificial están reconfigurando mercados laborales tradicionales, generando tanto oportunidades como desafíos en términos de desigualdad y acceso. La brecha digital se convierte en un factor determinante de inclusión social.

    La dependencia tecnológica plantea cuestiones éticas sobre autonomía personal, vigilancia y control de datos. Las plataformas digitales ejercen influencia significativa en la formación de opinión pública y comportamientos colectivos, lo que requiere reflexión crítica sobre su rol en la democracia.`;

                const userMessage = `Genera una respuesta hipotética detallada para esta pregunta: "${query}"`;

                const messages: ChatMessage[] = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ];

                // Generate hypothetical answer
                const hydeAnswer = await this.llmProvider.generateResponse(messages);

                // Return the generated answer, trimmed
                return hydeAnswer.trim();

            } catch (error) {
                // On any error, return empty string
                // This allows the system to fall back to using the original query
                return '';
            }
        }
}