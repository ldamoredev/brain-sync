import { db } from '../db';
import { notes } from "../db/schema";
import { Note } from "../../domain/entities/Note";
import { cosineDistance, desc, sql } from 'drizzle-orm';
import { NoteRepository } from '../../domain/entities/NoteRepository';

export class DrizzleNoteRepository implements NoteRepository {
    async save(note: Note): Promise<void> {
        await db.insert(notes).values({
            id: note.id,
            content: note.content,
            embedding: note.embedding,
        });
    }

    async findSimilar(queryVector: number[], limit = 3): Promise<any> {
        const similarity = sql`1 - (${cosineDistance(notes.embedding, queryVector)})`;

        return db
            .select({
                id: notes.id,
                content: notes.content,
                similarity: similarity,
            })
            .from(notes)
            .orderBy(t => desc(similarity)) // Los más parecidos primero
            .limit(limit);
    }
}