import { db } from '../db';
import { chunks, notes } from '../db/schema';
import { Chunk } from '../../domain/entities/Chunk';
import { ChunkRepository, ChunkSearchResult } from '../../domain/entities/ChunkRepository';
import { eq, cosineDistance, desc, sql, gt, and } from 'drizzle-orm';

export class DrizzleChunkRepository extends ChunkRepository {
    async save(chunk: Chunk): Promise<void> {
        await db.insert(chunks).values({
            id: chunk.id,
            noteId: chunk.noteId,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            startChar: chunk.startChar,
            endChar: chunk.endChar,
            embedding: chunk.embedding,
            contextualEmbedding: chunk.contextualEmbedding,
            createdAt: chunk.createdAt,
        });
    }

    async saveBatch(chunkList: Chunk[]): Promise<void> {
        if (chunkList.length === 0) return;
        
        const values = chunkList.map(chunk => ({
            id: chunk.id,
            noteId: chunk.noteId,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            startChar: chunk.startChar,
            endChar: chunk.endChar,
            embedding: chunk.embedding,
            contextualEmbedding: chunk.contextualEmbedding,
            createdAt: chunk.createdAt,
        }));

        await db.insert(chunks).values(values);
    }

    async findById(id: string): Promise<Chunk | undefined> {
        const result = await db.select().from(chunks).where(eq(chunks.id, id));
        if (result.length === 0) return undefined;
        
        const row = result[0]!;
        return new Chunk(
            row.id,
            row.noteId,
            row.content,
            row.chunkIndex,
            row.startChar,
            row.endChar,
            row.embedding ?? [],
            row.contextualEmbedding ?? [],
            row.createdAt
        );
    }

    async findByNoteId(noteId: string): Promise<Chunk[]> {
        const result = await db
            .select()
            .from(chunks)
            .where(eq(chunks.noteId, noteId))
            .orderBy(chunks.chunkIndex);

        return result.map(row => new Chunk(
            row.id,
            row.noteId,
            row.content,
            row.chunkIndex,
            row.startChar,
            row.endChar,
            row.embedding ?? [],
            row.contextualEmbedding ?? [],
            row.createdAt
        ));
    }

    async semanticSearch(queryVector: number[], limit: number, threshold: number): Promise<ChunkSearchResult[]> {
        const similarity = sql<number>`1 - (${cosineDistance(chunks.contextualEmbedding, queryVector)})`;

        const results = await db
            .select({
                id: chunks.id,
                noteId: chunks.noteId,
                content: chunks.content,
                chunkIndex: chunks.chunkIndex,
                startChar: chunks.startChar,
                endChar: chunks.endChar,
                embedding: chunks.embedding,
                contextualEmbedding: chunks.contextualEmbedding,
                createdAt: chunks.createdAt,
                similarity: similarity,
            })
            .from(chunks)
            .where(gt(similarity, threshold))
            .orderBy(desc(similarity))
            .limit(limit);

        return results.map((row, index) => ({
            chunk: new Chunk(
                row.id,
                row.noteId,
                row.content,
                row.chunkIndex,
                row.startChar,
                row.endChar,
                row.embedding ?? [],
                row.contextualEmbedding ?? [],
                row.createdAt
            ),
            score: row.similarity,
            rank: index + 1,
        }));
    }

    async fullTextSearch(query: string, limit: number, threshold: number): Promise<ChunkSearchResult[]> {
        // Escape special characters for PostgreSQL full-text search
        const escapedQuery = query.replace(/[&|!()]/g, '\\$&');
        
        const rank = sql<number>`ts_rank_cd(${chunks.tsvector}, plainto_tsquery('spanish', ${escapedQuery}))`;
        
        const results = await db
            .select({
                id: chunks.id,
                noteId: chunks.noteId,
                content: chunks.content,
                chunkIndex: chunks.chunkIndex,
                startChar: chunks.startChar,
                endChar: chunks.endChar,
                embedding: chunks.embedding,
                contextualEmbedding: chunks.contextualEmbedding,
                createdAt: chunks.createdAt,
                rank: rank,
            })
            .from(chunks)
            .where(
                and(
                    sql`${chunks.tsvector} @@ plainto_tsquery('spanish', ${escapedQuery})`,
                    gt(rank, threshold)
                )
            )
            .orderBy(desc(rank))
            .limit(limit);

        // Normalize scores to [0, 1] range
        const maxRank = results.length > 0 ? Math.max(...results.map(r => r.rank)) : 1;
        
        return results.map((row, index) => ({
            chunk: new Chunk(
                row.id,
                row.noteId,
                row.content,
                row.chunkIndex,
                row.startChar,
                row.endChar,
                row.embedding ?? [],
                row.contextualEmbedding ?? [],
                row.createdAt
            ),
            score: maxRank > 0 ? row.rank / maxRank : 0,
            rank: index + 1,
        }));
    }

    async findExpandedContext(chunkId: string, sentencesBefore: number, sentencesAfter: number): Promise<string> {
        // First, get the target chunk
        const targetChunk = await this.findById(chunkId);
        if (!targetChunk) {
            return '';
        }

        // Get the parent note content
        const noteResult = await db
            .select({ content: notes.content })
            .from(notes)
            .where(eq(notes.id, targetChunk.noteId));
        
        if (noteResult.length === 0) {
            return targetChunk.content;
        }

        const noteContent = noteResult[0]!.content;
        
        // Extract text before and after the chunk
        const beforeText = noteContent.substring(0, targetChunk.startChar);
        const afterText = noteContent.substring(targetChunk.endChar);
        
        // Split into sentences using Spanish sentence detection
        // Match sentences including Spanish opening punctuation (¿¡) and ending punctuation
        const sentenceRegex = /[¿¡]?[^.!?]+[.!?]+/g;
        const beforeSentences = (beforeText.match(sentenceRegex) || []).map(s => s.trim()).filter(s => s.length > 0);
        const afterSentences = (afterText.match(sentenceRegex) || []).map(s => s.trim()).filter(s => s.length > 0);
        
        // Get the requested number of sentences before and after
        const contextBefore = beforeSentences
            .slice(-sentencesBefore)
            .join(' ')
            .trim();
        
        const contextAfter = afterSentences
            .slice(0, sentencesAfter)
            .join(' ')
            .trim();
        
        // Combine the context
        const parts = [
            contextBefore,
            targetChunk.content,
            contextAfter
        ].filter(part => part.length > 0);
        
        return parts.join(' ');
    }

    async deleteByNoteId(noteId: string): Promise<void> {
        await db.delete(chunks).where(eq(chunks.noteId, noteId));
    }
}