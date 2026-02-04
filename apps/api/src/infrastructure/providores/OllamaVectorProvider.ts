import 'dotenv/config';
import type { VectorProvider } from '../../application/providers/VectorProvider.js';
import { OllamaEmbeddings } from '@langchain/ollama';

export class OllamaVectorProvider implements VectorProvider {
    private embeddings = new OllamaEmbeddings({
        model: process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text",
        baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    });


    async generateEmbedding(text: string): Promise<number[]> {
        return this.embeddings.embedQuery(text);
    }
}
