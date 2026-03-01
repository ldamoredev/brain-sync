export interface RetrievalMetadata {
    originalScore?: number;
    rerankScore?: number;
    chunkIndex: number;
    matchedChunkBounds: {
        start: number;
        end: number;
    };
    retrievalMethod: 'semantic' | 'fulltext' | 'hybrid';
}

export class RetrievalResult {
    constructor(
        public readonly chunkId: string,
        public readonly noteId: string,
        public readonly content: string,
        public readonly expandedContent: string,
        public readonly score: number,
        public readonly metadata: RetrievalMetadata
    ) {}
}