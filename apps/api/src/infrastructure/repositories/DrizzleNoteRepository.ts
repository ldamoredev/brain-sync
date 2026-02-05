import { db } from '../db';
import { notes } from "../db/schema";
import { Note } from "../../domain/entities/Note";
import { eq, cosineDistance, desc, sql } from 'drizzle-orm';
import { NoteRepository } from '../../domain/entities/NoteRepository';

export class DrizzleNoteRepository implements NoteRepository {
    async save(note: Note): Promise<void> {
        await db.insert(notes).values({
            id: note.id,
            content: note.content,
            embedding: note.embedding,
        });
    }

    async findById(id: string): Promise<(Note | undefined)> {
        const result = await db.select().from(notes).where(eq(notes.id, id)) as any;
        if (result.length === 0) return undefined;
        const { content, embedding, createdAt } = result[0];
        return new Note(id, content, embedding ?? undefined, createdAt);
    }

    async findSimilar(queryVector: number[], limit = 3): Promise<Note[]> {
        const similarity = sql<number>`1 - (${cosineDistance(notes.embedding, queryVector)})`;

        return db
            .select({
                id: notes.id,
                content: notes.content,
                similarity: similarity,
            })
            .from(notes)
            .orderBy(t => desc(similarity))
            .limit(limit) as any;
    }

    async findAll(): Promise<{ id: string; content: string; createdAt: Date }[]> {
        return db
            .select({
                id: notes.id,
                content: notes.content,
                createdAt: notes.createdAt,
            })
            .from(notes)
            .orderBy(desc(notes.createdAt));
    }
}
