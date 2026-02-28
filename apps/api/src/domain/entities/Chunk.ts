export class Chunk {
    constructor(
        public readonly id: string,
        public readonly noteId: string,
        public readonly content: string,
        public readonly chunkIndex: number,
        public readonly startChar: number,
        public readonly endChar: number,
        public readonly embedding: number[],
        public readonly contextualEmbedding: number[],
        public readonly createdAt: Date
    ) {}
}