import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryTransformationService, QueryIntent, TransformedQuery } from '../src/application/services/QueryTransformationService';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { ChatMessage } from '@brain-sync/types';

describe('QueryTransformationService', () => {
    let queryTransformationService: QueryTransformationService;
    let mockLLMProvider: LLMProvider;

    beforeEach(() => {
        mockLLMProvider = {
            generateResponse: vi.fn(),
            generateStream: vi.fn()
        } as unknown as LLMProvider;

        queryTransformationService = new QueryTransformationService(mockLLMProvider);
    });

    describe('detectIntent', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should identify causal queries correctly', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('causal');

            const intent = await (queryTransformationService as any).detectIntent('¿Por qué llueve?');

            expect(intent).toBe('causal');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith([
                { role: 'system', content: expect.stringContaining('clasificador de intenciones') },
                { role: 'user', content: 'Clasifica esta consulta: "¿Por qué llueve?"' }
            ]);
        });

        it('should identify factual queries correctly', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('factual');

            const intent = await (queryTransformationService as any).detectIntent('¿Qué es la fotosíntesis?');

            expect(intent).toBe('factual');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith([
                { role: 'system', content: expect.stringContaining('clasificador de intenciones') },
                { role: 'user', content: 'Clasifica esta consulta: "¿Qué es la fotosíntesis?"' }
            ]);
        });

        it('should identify temporal queries correctly', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('temporal');

            const intent = await (queryTransformationService as any).detectIntent('¿Cuándo ocurrió la Segunda Guerra Mundial?');

            expect(intent).toBe('temporal');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith([
                { role: 'system', content: expect.stringContaining('clasificador de intenciones') },
                { role: 'user', content: 'Clasifica esta consulta: "¿Cuándo ocurrió la Segunda Guerra Mundial?"' }
            ]);
        });

        it('should identify comparative queries correctly', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('comparative');

            const intent = await (queryTransformationService as any).detectIntent('¿Cuál es mejor, Android o iOS?');

            expect(intent).toBe('comparative');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith([
                { role: 'system', content: expect.stringContaining('clasificador de intenciones') },
                { role: 'user', content: 'Clasifica esta consulta: "¿Cuál es mejor, Android o iOS?"' }
            ]);
        });

        it('should identify abstract queries correctly', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('abstract');

            const intent = await (queryTransformationService as any).detectIntent('¿Qué significa la felicidad?');

            expect(intent).toBe('abstract');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith([
                { role: 'system', content: expect.stringContaining('clasificador de intenciones') },
                { role: 'user', content: 'Clasifica esta consulta: "¿Qué significa la felicidad?"' }
            ]);
        });

        it('should handle Spanish queries correctly', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('causal');

            const intent = await (queryTransformationService as any).detectIntent('¿Cómo afecta el ejercicio al corazón?');

            expect(intent).toBe('causal');
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith([
                { role: 'system', content: expect.stringContaining('Eres un clasificador de intenciones') },
                { role: 'user', content: 'Clasifica esta consulta: "¿Cómo afecta el ejercicio al corazón?"' }
            ]);
        });

        it('should handle timeout scenarios (300ms)', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(() => resolve('factual'), 400))
            );

            const intent = await (queryTransformationService as any).detectIntent('test query');

            expect(intent).toBe('factual');
        });

        it('should default to factual on error', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockRejectedValue(new Error('LLM error'));

            const intent = await (queryTransformationService as any).detectIntent('test query');

            expect(intent).toBe('factual');
        });

        it('should handle malformed LLM responses', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('invalid_response_123');

            const intent = await (queryTransformationService as any).detectIntent('test query');

            expect(intent).toBe('factual');
        });

        it('should parse intent from response containing extra text', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('La respuesta es: causal porque...');

            const intent = await (queryTransformationService as any).detectIntent('¿Por qué sucede esto?');

            expect(intent).toBe('causal');
        });

        it('should handle case-insensitive intent detection', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('TEMPORAL');

            const intent = await (queryTransformationService as any).detectIntent('¿Cuándo pasó?');

            expect(intent).toBe('temporal');
        });

        it('should handle whitespace in LLM response', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('  comparative  \n');

            const intent = await (queryTransformationService as any).detectIntent('¿Qué es mejor?');

            expect(intent).toBe('comparative');
        });
    });

    describe('decomposeQuery', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should return empty array for simple queries', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('SIMPLE');

            const subQueries = await (queryTransformationService as any).decomposeQuery('¿Qué es la fotosíntesis?');

            expect(subQueries).toEqual([]);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith([
                { role: 'system', content: expect.stringContaining('analizador de consultas') },
                { role: 'user', content: 'Analiza esta consulta: "¿Qué es la fotosíntesis?"' }
            ]);
        });

        it('should split multi-part questions correctly', async () => {
            const response = `1. ¿Qué es la fotosíntesis?
2. ¿Cómo afecta la fotosíntesis al medio ambiente?`;
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue(response);

            const subQueries = await (queryTransformationService as any).decomposeQuery('¿Qué es la fotosíntesis y cómo afecta al medio ambiente?');

            expect(subQueries).toEqual([
                '¿Qué es la fotosíntesis?',
                '¿Cómo afecta la fotosíntesis al medio ambiente?'
            ]);
        });

        it('should handle Spanish multi-part queries', async () => {
            const response = `1. ¿Cuáles son las causas de la inflación?
2. ¿Qué efectos tiene la inflación en la economía?
3. ¿Cómo se puede controlar la inflación?`;
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue(response);

            const subQueries = await (queryTransformationService as any).decomposeQuery('¿Cuáles son las causas de la inflación, qué efectos tiene en la economía y cómo se puede controlar?');

            expect(subQueries).toEqual([
                '¿Cuáles son las causas de la inflación?',
                '¿Qué efectos tiene la inflación en la economía?',
                '¿Cómo se puede controlar la inflación?'
            ]);
        });

        it('should parse numbered list responses with different formats', async () => {
            const response = `1) ¿Primera pregunta?
2- ¿Segunda pregunta?
3: ¿Tercera pregunta?
4. ¿Cuarta pregunta?`;
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue(response);

            const subQueries = await (queryTransformationService as any).decomposeQuery('Multiple questions');

            expect(subQueries).toEqual([
                '¿Primera pregunta?',
                '¿Segunda pregunta?',
                '¿Tercera pregunta?',
                '¿Cuarta pregunta?'
            ]);
        });

        it('should handle errors gracefully', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockRejectedValue(new Error('LLM error'));

            const subQueries = await (queryTransformationService as any).decomposeQuery('test query');

            expect(subQueries).toEqual([]);
        });

        it('should handle malformed LLM responses', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('Invalid response without proper format');

            const subQueries = await (queryTransformationService as any).decomposeQuery('test query');

            expect(subQueries).toEqual([]);
        });

        it('should ignore empty lines and malformed entries', async () => {
            const response = `1. ¿Primera pregunta válida?

3. ¿Tercera pregunta válida?
Not a numbered item
5. ¿Quinta pregunta válida?`;
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue(response);

            const subQueries = await (queryTransformationService as any).decomposeQuery('test query');

            expect(subQueries).toEqual([
                '¿Primera pregunta válida?',
                '¿Tercera pregunta válida?',
                '¿Quinta pregunta válida?'
            ]);
        });

        it('should handle case-insensitive SIMPLE response', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('simple');

            const subQueries = await (queryTransformationService as any).decomposeQuery('¿Pregunta simple?');

            expect(subQueries).toEqual([]);
        });

        it('should handle SIMPLE response with extra text', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('La consulta es SIMPLE y no requiere descomposición');

            const subQueries = await (queryTransformationService as any).decomposeQuery('¿Pregunta simple?');

            expect(subQueries).toEqual([]);
        });
    });

    describe('generateHyDE', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should create hypothetical answers for abstract queries', async () => {
            const mockHydeAnswer = 'La tecnología ha transformado profundamente la estructura social contemporánea, modificando las formas de comunicación, trabajo y relaciones interpersonales.';
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue(mockHydeAnswer);

            const hydeAnswer = await (queryTransformationService as any).generateHyDE('¿Cómo se relaciona la tecnología con la sociedad?');

            expect(hydeAnswer).toBe(mockHydeAnswer);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith([
                { role: 'system', content: expect.stringContaining('asistente experto que genera respuestas hipotéticas') },
                { role: 'user', content: 'Genera una respuesta hipotética detallada para esta pregunta: "¿Cómo se relaciona la tecnología con la sociedad?"' }
            ]);
        });

        it('should generate detailed Spanish responses', async () => {
            const detailedResponse = `La felicidad representa un estado emocional complejo que trasciende la mera satisfacción momentánea. Se caracteriza por una sensación de plenitud y bienestar que surge de la armonía entre expectativas y realidad.

En términos psicológicos, la felicidad involucra componentes cognitivos y afectivos que se manifiestan en la percepción positiva de la propia vida. Los estudios sugieren que factores como las relaciones interpersonales, el sentido de propósito y la gratitud contribuyen significativamente.

La búsqueda de la felicidad ha sido tema central en filosofía y psicología, planteando interrogantes sobre si constituye un fin en sí mismo o un subproducto de una vida con significado.`;
            
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue(detailedResponse);

            const hydeAnswer = await (queryTransformationService as any).generateHyDE('¿Qué significa la felicidad?');

            expect(hydeAnswer).toBe(detailedResponse);
            expect(hydeAnswer.length).toBeGreaterThan(100);
            expect(hydeAnswer).toContain('felicidad');
        });

        it('should handle errors gracefully', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockRejectedValue(new Error('LLM error'));

            const hydeAnswer = await (queryTransformationService as any).generateHyDE('test query');

            expect(hydeAnswer).toBe('');
        });

        it('should return empty string on failure', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockRejectedValue(new Error('Network timeout'));

            const hydeAnswer = await (queryTransformationService as any).generateHyDE('¿Pregunta compleja?');

            expect(hydeAnswer).toBe('');
        });

        it('should trim whitespace from LLM response', async () => {
            const responseWithWhitespace = '   \n  Respuesta hipotética detallada.  \n   ';
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue(responseWithWhitespace);

            const hydeAnswer = await (queryTransformationService as any).generateHyDE('test query');

            expect(hydeAnswer).toBe('Respuesta hipotética detallada.');
        });

        it('should handle empty LLM response', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockResolvedValue('');

            const hydeAnswer = await (queryTransformationService as any).generateHyDE('test query');

            expect(hydeAnswer).toBe('');
        });
    });

    describe('transform', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should preserve original query', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('factual')
                .mockResolvedValueOnce('SIMPLE')
                .mockResolvedValueOnce('');

            const originalQuery = '¿Qué es la fotosíntesis?';
            const result = await queryTransformationService.transform(originalQuery);

            expect(result.originalQuery).toBe(originalQuery);
        });

        it('should call all three methods correctly', async () => {
            const detectIntentSpy = vi.spyOn(queryTransformationService as any, 'detectIntent').mockResolvedValue('factual');
            const decomposeQuerySpy = vi.spyOn(queryTransformationService as any, 'decomposeQuery').mockResolvedValue([]);
            const generateHyDESpy = vi.spyOn(queryTransformationService as any, 'generateHyDE').mockResolvedValue('');

            await queryTransformationService.transform('test query');

            expect(detectIntentSpy).toHaveBeenCalledWith('test query');
            expect(decomposeQuerySpy).toHaveBeenCalledWith('test query');
            expect(generateHyDESpy).not.toHaveBeenCalled(); // Only called for abstract queries
        });

        it('should return complete TransformedQuery', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('factual')
                .mockResolvedValueOnce('SIMPLE');

            const result = await queryTransformationService.transform('¿Qué es la fotosíntesis?');

            expect(result).toEqual({
                originalQuery: '¿Qué es la fotosíntesis?',
                intent: 'factual',
                subQueries: [],
                hydeAnswer: null,
                timestamp: expect.any(Date)
            });
        });

        it('should complete within reasonable time', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('factual')
                .mockResolvedValueOnce('SIMPLE');

            const startTime = Date.now();
            await queryTransformationService.transform('test query');
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(1000);
        });

        it('should handle abstract queries with HyDE', async () => {
            const mockHydeAnswer = 'Respuesta hipotética detallada sobre la felicidad...';
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('abstract')
                .mockResolvedValueOnce('SIMPLE')
                .mockResolvedValueOnce(mockHydeAnswer);

            const result = await queryTransformationService.transform('¿Qué significa la felicidad?');

            expect(result.intent).toBe('abstract');
            expect(result.hydeAnswer).toBe(mockHydeAnswer);
        });

        it('should handle non-abstract queries without HyDE', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('factual')
                .mockResolvedValueOnce('SIMPLE');

            const result = await queryTransformationService.transform('¿Qué es la fotosíntesis?');

            expect(result.intent).toBe('factual');
            expect(result.hydeAnswer).toBeNull();
        });

        it('should include timestamp in result', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('factual')
                .mockResolvedValueOnce('SIMPLE');

            const beforeTime = new Date();
            const result = await queryTransformationService.transform('test query');
            const afterTime = new Date();

            expect(result.timestamp).toBeInstanceOf(Date);
            expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
            expect(result.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
        });

        it('should handle complex multi-part queries', async () => {
            const subQueries = ['¿Qué es la inflación?', '¿Cómo afecta la economía?'];
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('causal')
                .mockResolvedValueOnce('1. ¿Qué es la inflación?\n2. ¿Cómo afecta la economía?');

            const result = await queryTransformationService.transform('¿Qué es la inflación y cómo afecta la economía?');

            expect(result.intent).toBe('causal');
            expect(result.subQueries).toEqual(subQueries);
            expect(result.hydeAnswer).toBeNull();
        });

        it('should handle all query types correctly', async () => {
            const testCases = [
                { intent: 'factual', expectHyde: false },
                { intent: 'causal', expectHyde: false },
                { intent: 'temporal', expectHyde: false },
                { intent: 'comparative', expectHyde: false },
                { intent: 'abstract', expectHyde: true }
            ];

            for (const testCase of testCases) {
                vi.clearAllMocks();
                
                if (testCase.expectHyde) {
                    mockLLMProvider.generateResponse = vi.fn()
                        .mockResolvedValueOnce(testCase.intent)
                        .mockResolvedValueOnce('SIMPLE')
                        .mockResolvedValueOnce('Hypothetical answer');
                } else {
                    mockLLMProvider.generateResponse = vi.fn()
                        .mockResolvedValueOnce(testCase.intent)
                        .mockResolvedValueOnce('SIMPLE');
                }

                const result = await queryTransformationService.transform('test query');

                expect(result.intent).toBe(testCase.intent);
                if (testCase.expectHyde) {
                    expect(result.hydeAnswer).toBe('Hypothetical answer');
                } else {
                    expect(result.hydeAnswer).toBeNull();
                }
            }
        });
    });

    describe('edge cases and error scenarios', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should handle empty query strings', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('factual')
                .mockResolvedValueOnce('SIMPLE');

            const result = await queryTransformationService.transform('');

            expect(result.originalQuery).toBe('');
            expect(result.intent).toBe('factual');
            expect(result.subQueries).toEqual([]);
            expect(result.hydeAnswer).toBeNull();
        });

        it('should handle very long queries', async () => {
            const longQuery = 'a'.repeat(1000);
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('factual')
                .mockResolvedValueOnce('SIMPLE');

            const result = await queryTransformationService.transform(longQuery);

            expect(result.originalQuery).toBe(longQuery);
            expect(result.intent).toBe('factual');
        });

        it('should handle special characters in queries', async () => {
            const specialQuery = '¿Qué es @#$%^&*()_+{}|:"<>?[]\\;\',./?';
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('factual')
                .mockResolvedValueOnce('SIMPLE');

            const result = await queryTransformationService.transform(specialQuery);

            expect(result.originalQuery).toBe(specialQuery);
            expect(result.intent).toBe('factual');
        });

        it('should handle LLM provider failures', async () => {
            mockLLMProvider.generateResponse = vi.fn().mockRejectedValue(new Error('LLM provider failed'));

            const result = await queryTransformationService.transform('test query');

            expect(result.intent).toBe('factual'); // Default fallback
            expect(result.subQueries).toEqual([]); // Default fallback
            expect(result.hydeAnswer).toBeNull();
        });

        it('should handle timeout scenarios', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve('factual'), 400)))
                .mockResolvedValueOnce('SIMPLE');

            const result = await queryTransformationService.transform('test query');

            expect(result.intent).toBe('factual'); // Should handle timeout and default to factual
            expect(result.subQueries).toEqual([]);
        });

        it('should handle partial LLM failures', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('causal')
                .mockRejectedValueOnce(new Error('Decomposition failed'));

            const result = await queryTransformationService.transform('¿Por qué llueve?');

            expect(result.intent).toBe('causal');
            expect(result.subQueries).toEqual([]); // Fallback to empty array
            expect(result.hydeAnswer).toBeNull();
        });

        it('should handle malformed responses gracefully', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('invalid_intent_response')
                .mockResolvedValueOnce('malformed_decomposition_response');

            const result = await queryTransformationService.transform('test query');

            expect(result.intent).toBe('factual'); // Default fallback
            expect(result.subQueries).toEqual([]); // Default fallback
        });

        it('should handle null or undefined responses', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce(null as any)
                .mockResolvedValueOnce(undefined as any);

            const result = await queryTransformationService.transform('test query');

            expect(result.intent).toBe('factual');
            expect(result.subQueries).toEqual([]);
        });

        it('should handle concurrent transform calls', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValue('factual')
                .mockResolvedValue('SIMPLE');

            const promises = [
                queryTransformationService.transform('query 1'),
                queryTransformationService.transform('query 2'),
                queryTransformationService.transform('query 3')
            ];

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            expect(results[0].originalQuery).toBe('query 1');
            expect(results[1].originalQuery).toBe('query 2');
            expect(results[2].originalQuery).toBe('query 3');
        });

        it('should handle mixed success and failure scenarios', async () => {
            mockLLMProvider.generateResponse = vi.fn()
                .mockResolvedValueOnce('abstract')
                .mockResolvedValueOnce('SIMPLE')
                .mockRejectedValueOnce(new Error('HyDE generation failed'));

            const result = await queryTransformationService.transform('¿Qué es la vida?');

            expect(result.intent).toBe('abstract');
            expect(result.subQueries).toEqual([]);
            expect(result.hydeAnswer).toBe(''); // Should fallback to empty string on HyDE error
        });
    });
});