import { ChunkingService } from './src/application/services/ChunkingService';

const mockVectorProvider = {
    generateEmbedding: async () => [0.1, 0.2, 0.3]
} as any;

const mockLLMProvider = {
    generateResponse: async () => 'test'
} as any;

const service = new ChunkingService(mockVectorProvider, mockLLMProvider, {
    maxChunkSize: 512,
    overlapSize: 50,
    minChunkSize: 100
});

const text = '¿Cómo estás? ¡Muy bien! Esto es una prueba. ¿Entiendes?';
const segments = (service as any).segmentBySentences(text);

console.log('Segments:', JSON.stringify(segments, null, 2));
console.log('Length:', segments.length);
