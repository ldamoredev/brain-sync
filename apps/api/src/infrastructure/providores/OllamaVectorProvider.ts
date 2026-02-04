import type { VectorProvider } from '../../application/providers/VectorProvider.js';
import { OllamaEmbeddings } from '@langchain/ollama';

export class OllamaVectorProvider implements VectorProvider {
    private embeddings = new OllamaEmbeddings({
        model: "nomic-embed-text",
        baseUrl: "http://localhost:11434",
    });


    async generateEmbedding(text: string): Promise<number[]> {
        return this.embeddings.embedQuery(text);
    }
}