import { Chunk } from './Chunk';

export interface ChunkSearchResult {
    chunk: Chunk;
    score: number;
    rank: number;
}

export abstract class ChunkRepository {
    abstract save(chunk: Chunk): Promise<void>;
    abstract saveBatch(chunks: Chunk[]): Promise<void>;
    abstract findById(id: string): Promise<Chunk | undefined>;
    abstract findByNoteId(noteId: string): Promise<Chunk[]>;
    abstract semanticSearch(queryVector: number[], limit: number, threshold: number): Promise<ChunkSearchResult[]>;
    abstract fullTextSearch(query: string, limit: number, threshold: number): Promise<ChunkSearchResult[]>;
    abstract findExpandedContext(chunkId: string, sentencesBefore: number, sentencesAfter: number): Promise<string>;
    abstract deleteByNoteId(noteId: string): Promise<void>;
}