import { db } from '../db';
import { notes } from "../db/schema";
import { Note } from "../../domain/entities/Note";
import { eq, cosineDistance, desc, sql, gt } from 'drizzle-orm';
import { NoteRepository } from '../../domain/entities/NoteRepository';

export class DrizzleNoteRepository implements NoteRepository {
    async save(note: Note): Promise<void> {
        await db.insert(notes).values({
            id: note.id,
            content: note.content,
            embedding: note.embedding,
            createdAt: note.createdAt,
        });
    }

    async findById(id: string): Promise<(Note | undefined)> {
        const result = await db.select().from(notes).where(eq(notes.id, id));
        if (result.length === 0) return undefined;
        const { content, embedding, createdAt } = result[0]!;
        return new Note(id, content, embedding ?? [], createdAt);
    }

    async findSimilar(queryVector: number[], limit = 5, threshold = 0.5): Promise<Note[]> {
        const similarity = sql<number>`1 - (${cosineDistance(notes.embedding, queryVector)})`;

        return db
            .select({
                id: notes.id,
                content: notes.content,
                createdAt: notes.createdAt,
                similarity: similarity,
            })
            .from(notes)
            .where(gt(similarity, threshold)) // Only return notes above the threshold
            .orderBy(t => desc(similarity))
            .limit(limit) as any;
    }

    async findAll(): Promise<Note[]> {
        return db
            .select({
                id: notes.id,
                content: notes.content,
                embedding: notes.embedding,
                createdAt: notes.createdAt,
            })
            .from(notes)
            .orderBy(desc(notes.createdAt))
            .then(rows => rows.map(row => new Note(row.id, row.content, row.embedding ?? [], row.createdAt)));
    }
}
