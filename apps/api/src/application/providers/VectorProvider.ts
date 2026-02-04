export interface VectorProvider {
    generateEmbedding(text: string): Promise<number[]>;
}
