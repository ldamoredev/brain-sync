import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoutineGeneratorGraph } from '../src/application/agents/RoutineGeneratorGraph';
import { LLMProvider } from '../src/application/providers/LLMProvider';
import { CheckpointerProvider } from '../src/application/providers/CheckpointerProvider';
import { RepositoryProvider } from '../src/infrastructure/repositories/RepositoryProvider';
import { DailySummaryRepository } from '../src/domain/entities/DailySummaryRepository';
import { RoutineRepository } from '../src/domain/entities/RoutineRepository';

describe('RoutineGeneratorGraph', () => {
    let graph: RoutineGeneratorGraph;
    let mockLLMProvider: LLMProvider;
    let mockCheckpointer: CheckpointerProvider;
    let mockRepositories: RepositoryProvider;
    let mockDailySummaryRepository: DailySummaryRepository;
    let mockRoutineRepository: RoutineRepository;

    beforeEach(() => {
        // Mock LLM Provider
        mockLLMProvider = {
            generateResponse: vi.fn(),
            generateStream: vi.fn()
        } as unknown as LLMProvider;

        // Mock Daily Summary Repository
        mockDailySummaryRepository = {
            save: vi.fn(),
            findByDate: vi.fn()
        } as unknown as DailySummaryRepository;

        // Mock Routine Repository
        mockRoutineRepository = {
            save: vi.fn(),
            findByDate: vi.fn()
        } as unknown as RoutineRepository;

        // Mock Repository Provider
        mockRepositories = {
            get: vi.fn((type) => {
                if (type === DailySummaryRepository) return mockDailySummaryRepository;
                if (type === RoutineRepository) return mockRoutineRepository;
                throw new Error('Unknown repository type');
            })
        } as unknown as RepositoryProvider;

        // Mock Checkpointer
        mockCheckpointer = {
            save: vi.fn().mockResolvedValue('checkpoint-id'),
            load: vi.fn().mockResolvedValue(null),
            list: vi.fn().mockResolvedValue([]),
            delete: vi.fn().mockResolvedValue(undefined)
        } as unknown as CheckpointerProvider;

        graph = new RoutineGeneratorGraph(mockLLMProvider, mockRepositories, mockCheckpointer);
    });

    describe('Analyzer node', () => {
        it('should fetch and format yesterday context from daily summary', async () => {
            const testDate = '2024-01-16';
            const mockSummary = {
                id: "",
                date: '2024-01-15',
                summary: 'Día productivo con buen estado de ánimo',
                riskLevel: 3,
                keyInsights: ['Ejercicio matutino', 'Buena alimentación'],
                createdAt: '2024-01-15'
            } as any;

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(mockSummary);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify({
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma mental' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            }));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(mockDailySummaryRepository.findByDate).toHaveBeenCalledWith('2024-01-15');
            expect(result.state.yesterdayContext).toContain('2024-01-15');
            expect(result.state.yesterdayContext).toContain('Día productivo con buen estado de ánimo');
            expect(result.state.yesterdayContext).toContain('Nivel de riesgo: 3/10');
            expect(result.state.analysisResult).toBeDefined();
            expect(result.state.analysisResult?.riskLevel).toBe(3);
            expect(result.state.analysisResult?.recommendations).toHaveLength(2);
        }, 10000);

        it('should use default context when no previous summary exists', async () => {
            const testDate = '2024-01-16';

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify({
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            }));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.state.yesterdayContext).toBe('No hay datos previos.');
            expect(result.state.analysisResult?.riskLevel).toBe(5);
            expect(result.state.analysisResult?.recommendations).toContain('Establecer rutina básica de bienestar');
        }, 10000);
    });

    describe('Scheduler node', () => {
        it('should generate schedule with required fields', async () => {
            const testDate = '2024-01-16';
            const mockSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación matutina', expectedBenefit: 'Reducir ansiedad' },
                    { time: '12:00', activity: 'Caminata al aire libre', expectedBenefit: 'Mejorar estado de ánimo' },
                    { time: '20:00', activity: 'Journaling nocturno', expectedBenefit: 'Procesar emociones' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(mockSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalled();
            expect(result.state.rawSchedule).toBeDefined();
            expect(result.state.rawSchedule.activities).toHaveLength(3);
            expect(result.state.rawSchedule.activities[0]).toHaveProperty('time');
            expect(result.state.rawSchedule.activities[0]).toHaveProperty('activity');
            expect(result.state.rawSchedule.activities[0]).toHaveProperty('expectedBenefit');
        }, 10000);

        it('should retry on LLM failure with exponential backoff', async () => {
            const testDate = '2024-01-16';
            const mockSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse)
                .mockRejectedValueOnce(new Error('LLM error'))
                .mockRejectedValueOnce(new Error('LLM error'))
                .mockResolvedValueOnce(JSON.stringify(mockSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(3);
            expect(result.state.rawSchedule).toBeDefined();
        }, 15000);

        it('should fail after max retries exceeded', async () => {
            const testDate = '2024-01-16';

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockRejectedValue(new Error('LLM error'));

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toContain('Scheduler failed after 3 retries');
        }, 15000);
    });

    describe('Validator node', () => {
        it('should detect missing activities field', async () => {
            const testDate = '2024-01-16';
            const invalidSchedule = { data: 'invalid' };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse)
                .mockResolvedValueOnce(JSON.stringify(invalidSchedule))
                .mockResolvedValueOnce(JSON.stringify({
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                }));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);
            expect(result.state.validationAttempts).toBeGreaterThan(0);
        }, 10000);

        it('should detect invalid time format', async () => {
            const testDate = '2024-01-16';
            const invalidSchedule = {
                activities: [
                    { time: '8:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse)
                .mockResolvedValueOnce(JSON.stringify(invalidSchedule))
                .mockResolvedValueOnce(JSON.stringify({
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                }));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);
        }, 10000);

        it('should detect missing required fields', async () => {
            const testDate = '2024-01-16';
            const invalidSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación' }, // Missing expectedBenefit
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse)
                .mockResolvedValueOnce(JSON.stringify(invalidSchedule))
                .mockResolvedValueOnce(JSON.stringify({
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                }));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);
        }, 10000);

        it('should accept valid schedule', async () => {
            const testDate = '2024-01-16';
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación matutina', expectedBenefit: 'Reducir ansiedad' },
                    { time: '12:00', activity: 'Caminata al aire libre', expectedBenefit: 'Mejorar estado de ánimo' },
                    { time: '20:00', activity: 'Journaling nocturno', expectedBenefit: 'Procesar emociones' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(validSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(result.state.validatedSchedule).toBeDefined();
            expect(result.state.validatedSchedule.activities).toHaveLength(3);
        }, 10000);

        it('should route back to Scheduler on validation failure', async () => {
            const testDate = '2024-01-16';
            const invalidSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' }
                    // Only 1 activity, needs at least 3
                ]
            };
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse)
                .mockResolvedValueOnce(JSON.stringify(invalidSchedule))
                .mockResolvedValueOnce(JSON.stringify(validSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(2);
            expect(result.state.validationAttempts).toBeGreaterThan(0);
        }, 10000);

        it('should fail after max validation attempts', async () => {
            const testDate = '2024-01-16';
            const invalidSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(invalidSchedule));

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toContain('Schedule validation failed after 3 attempts');
        }, 15000);
    });

    describe('Formatter node', () => {
        it('should normalize activities from validated schedule', async () => {
            const testDate = '2024-01-16';
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación matutina', expectedBenefit: 'Reducir ansiedad' },
                    { time: '12:00', activity: 'Caminata', expectedBenefit: 'Mejorar ánimo' },
                    { time: '20:00', activity: 'Journaling', expectedBenefit: 'Procesar emociones' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(validSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.state.formattedRoutine).toBeDefined();
            expect(result.state.formattedRoutine?.activities).toHaveLength(3);
            expect(result.state.formattedRoutine?.activities[0]).toEqual({
                time: '08:00',
                activity: 'Meditación matutina',
                expectedBenefit: 'Reducir ansiedad'
            });
        }, 10000);
    });

    describe('checkApproval node', () => {
        it('should pause when requiresHumanApproval is true', async () => {
            const testDate = '2024-01-16';
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(validSchedule));

            const result = await graph.execute(
                { date: testDate },
                { maxRetries: 3, requiresHumanApproval: true }
            );

            expect(result.success).toBe(true);
            expect(result.status).toBe('paused');
            expect(result.state.requiresApproval).toBe(true);
            expect(result.state.currentNode).toBe('awaitingApproval');
        }, 10000);

        it('should continue to save when approval not required', async () => {
            const testDate = '2024-01-16';
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(validSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute(
                { date: testDate },
                { maxRetries: 3, requiresHumanApproval: false }
            );

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockRoutineRepository.save).toHaveBeenCalled();
        }, 10000);
    });

    describe('saveRoutine node', () => {
        it('should save routine to database', async () => {
            const testDate = '2024-01-16';
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(validSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockRoutineRepository.save).toHaveBeenCalledWith({
                targetDate: testDate,
                activities: validSchedule.activities
            });
        }, 10000);

        it('should not save when approval required but not approved', async () => {
            const testDate = '2024-01-16';
            const threadId = 'test-thread-id';
            const pausedState = {
                threadId,
                status: 'paused' as const,
                currentNode: 'awaitingApproval',
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: testDate,
                yesterdayContext: 'No hay datos previos.',
                analysisResult: {
                    riskLevel: 5,
                    recommendations: ['Establecer rutina básica de bienestar']
                },
                rawSchedule: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                validatedSchedule: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                formattedRoutine: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                validationAttempts: 1,
                requiresApproval: true,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state: pausedState,
                nodeId: 'awaitingApproval',
                createdAt: new Date()
            });

            const result = await graph.resume(threadId, { approved: false });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockRoutineRepository.save).not.toHaveBeenCalled();
        }, 10000);
    });

    describe('resume functionality', () => {
        it('should resume paused execution with approval', async () => {
            const testDate = '2024-01-16';
            const threadId = 'test-thread-id';
            const pausedState = {
                threadId,
                status: 'paused' as const,
                currentNode: 'awaitingApproval',
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: testDate,
                yesterdayContext: 'No hay datos previos.',
                analysisResult: {
                    riskLevel: 5,
                    recommendations: ['Establecer rutina básica de bienestar']
                },
                rawSchedule: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                validatedSchedule: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                formattedRoutine: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                validationAttempts: 1,
                requiresApproval: true,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state: pausedState,
                nodeId: 'awaitingApproval',
                createdAt: new Date()
            });
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.resume(threadId, { approved: true });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockRoutineRepository.save).toHaveBeenCalled();
        }, 10000);

        it('should complete without saving when approval denied', async () => {
            const testDate = '2024-01-16';
            const threadId = 'test-thread-id';
            const pausedState = {
                threadId,
                status: 'paused' as const,
                currentNode: 'awaitingApproval',
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: testDate,
                yesterdayContext: 'No hay datos previos.',
                analysisResult: {
                    riskLevel: 5,
                    recommendations: ['Establecer rutina básica de bienestar']
                },
                rawSchedule: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                validatedSchedule: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                formattedRoutine: {
                    activities: [
                        { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                        { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                        { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                    ]
                },
                validationAttempts: 1,
                requiresApproval: true,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state: pausedState,
                nodeId: 'awaitingApproval',
                createdAt: new Date()
            });

            const result = await graph.resume(threadId, { approved: false });

            expect(result.success).toBe(true);
            expect(result.status).toBe('completed');
            expect(mockRoutineRepository.save).not.toHaveBeenCalled();
        }, 10000);

        it('should throw error when checkpoint not found', async () => {
            const threadId = 'non-existent-thread';

            vi.mocked(mockCheckpointer.load).mockResolvedValue(null);

            await expect(graph.resume(threadId, { approved: true })).rejects.toThrow(
                'Thread de ejecución no encontrado'
            );
        });

        it('should throw error when resuming non-paused execution', async () => {
            const threadId = 'test-thread-id';
            const runningState = {
                threadId,
                status: 'running' as const,
                currentNode: 'scheduler',
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: '2024-01-16',
                yesterdayContext: '',
                analysisResult: null,
                rawSchedule: null,
                validatedSchedule: null,
                formattedRoutine: null,
                validationAttempts: 0,
                requiresApproval: false,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state: runningState,
                nodeId: 'scheduler',
                createdAt: new Date()
            });

            await expect(graph.resume(threadId, { approved: true })).rejects.toThrow(
                'Cannot resume execution that is not paused. Current status: running'
            );
        });
    });

    describe('validation feedback loop', () => {
        it('should add feedback to recommendations on each validation retry', async () => {
            const testDate = '2024-01-16';
            const invalidSchedule1 = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' }
                ]
            };
            const invalidSchedule2 = {
                activities: [
                    { time: '8:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse)
                .mockResolvedValueOnce(JSON.stringify(invalidSchedule1))
                .mockResolvedValueOnce(JSON.stringify(invalidSchedule2))
                .mockResolvedValueOnce(JSON.stringify(validSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.state.validationAttempts).toBeGreaterThan(1);
            expect(mockLLMProvider.generateResponse).toHaveBeenCalledTimes(3);
        }, 15000);
    });

    describe('checkpoint management', () => {
        it('should save checkpoint after each node transition', async () => {
            const testDate = '2024-01-16';
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(validSchedule));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            await graph.execute({ date: testDate }, { maxRetries: 3 });

            // Should save checkpoint after: analyzer, scheduler, validator, formatter, checkApproval, saveRoutine
            expect(mockCheckpointer.save).toHaveBeenCalled();
            expect(vi.mocked(mockCheckpointer.save).mock.calls.length).toBeGreaterThan(0);
        }, 10000);

        it('should restore state from checkpoint', async () => {
            const testDate = '2024-01-16';
            const threadId = 'existing-thread-id';
            const existingState = {
                threadId,
                status: 'running' as const,
                currentNode: 'scheduler',
                retryCount: 1,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: testDate,
                yesterdayContext: 'Contexto previo',
                analysisResult: {
                    riskLevel: 5,
                    recommendations: ['Recomendación 1']
                },
                rawSchedule: null,
                validatedSchedule: null,
                formattedRoutine: null,
                validationAttempts: 0,
                requiresApproval: false,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state: existingState,
                nodeId: 'scheduler',
                createdAt: new Date()
            });
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify({
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            }));
            vi.mocked(mockRoutineRepository.save).mockResolvedValue(undefined);

            const result = await graph.execute({ date: testDate }, { threadId, maxRetries: 3 });

            expect(result.success).toBe(true);
            expect(result.threadId).toBe(threadId);
            expect(mockCheckpointer.load).toHaveBeenCalledWith(threadId);
        }, 10000);
    });

    describe('error handling', () => {
        it('should handle database save failure gracefully', async () => {
            const testDate = '2024-01-16';
            const validSchedule = {
                activities: [
                    { time: '08:00', activity: 'Meditación', expectedBenefit: 'Calma' },
                    { time: '12:00', activity: 'Ejercicio', expectedBenefit: 'Energía' },
                    { time: '20:00', activity: 'Lectura', expectedBenefit: 'Relajación' }
                ]
            };

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse).mockResolvedValue(JSON.stringify(validSchedule));
            vi.mocked(mockRoutineRepository.save).mockRejectedValue(new Error('Database error'));

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toContain('Database temporarily unavailable');
        }, 10000);

        it('should handle JSON parsing failure in scheduler', async () => {
            const testDate = '2024-01-16';

            vi.mocked(mockDailySummaryRepository.findByDate).mockResolvedValue(null);
            vi.mocked(mockLLMProvider.generateResponse)
                .mockResolvedValueOnce('Invalid JSON response')
                .mockResolvedValueOnce('Still invalid')
                .mockResolvedValueOnce('Not JSON either');

            const result = await graph.execute({ date: testDate }, { maxRetries: 3 });

            expect(result.success).toBe(false);
            expect(result.status).toBe('failed');
            expect(result.state.error).toContain('Scheduler failed after 3 retries');
        }, 15000);
    });

    describe('getStatus', () => {
        it('should return current status and state', async () => {
            const threadId = 'test-thread-id';
            const state = {
                threadId,
                status: 'paused' as const,
                currentNode: 'awaitingApproval',
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: '2024-01-16',
                yesterdayContext: '',
                analysisResult: null,
                rawSchedule: null,
                validatedSchedule: null,
                formattedRoutine: null,
                validationAttempts: 0,
                requiresApproval: true,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state,
                nodeId: 'awaitingApproval',
                createdAt: new Date()
            });

            const result = await graph.getStatus(threadId);

            expect(result.status).toBe('paused');
            expect(result.state).toEqual(state);
        });

        it('should throw error when checkpoint not found', async () => {
            const threadId = 'non-existent-thread';

            vi.mocked(mockCheckpointer.load).mockResolvedValue(null);

            await expect(graph.getStatus(threadId)).rejects.toThrow(
                'Thread de ejecución no encontrado'
            );
        });
    });

    describe('cancel', () => {
        it('should cancel execution and mark as failed', async () => {
            const threadId = 'test-thread-id';
            const state = {
                threadId,
                status: 'running' as const,
                currentNode: 'scheduler',
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
                date: '2024-01-16',
                yesterdayContext: '',
                analysisResult: null,
                rawSchedule: null,
                validatedSchedule: null,
                formattedRoutine: null,
                validationAttempts: 0,
                requiresApproval: false,
                approved: false
            };

            vi.mocked(mockCheckpointer.load).mockResolvedValue({
                id: 'checkpoint-1',
                threadId,
                state,
                nodeId: 'scheduler',
                createdAt: new Date()
            });

            await graph.cancel(threadId);

            expect(mockCheckpointer.save).toHaveBeenCalled();
            const saveCall = vi.mocked(mockCheckpointer.save).mock.calls[0] as any;
            expect(saveCall[1].status).toBe('failed');
            expect(saveCall[1].error).toBe('Execution cancelled by user');
        });

        it('should throw error when checkpoint not found', async () => {
            const threadId = 'non-existent-thread';

            vi.mocked(mockCheckpointer.load).mockResolvedValue(null);

            await expect(graph.cancel(threadId)).rejects.toThrow(
                'Thread de ejecución no encontrado'
            );
        });
    });
});
