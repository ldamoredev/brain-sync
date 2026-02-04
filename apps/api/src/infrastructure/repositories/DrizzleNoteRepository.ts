import { db } from '../db';
import { notes } from "../db/schema";
import { Note } from "../../domain/entities/Note";
import { cosineDistance, desc, sql } from 'drizzle-orm';

export class DrizzleNoteRepository {
    async save(note: Note): Promise<void> {
        await db.insert(notes).values({
            id: note.id,
            content: note.content,
            embedding: note.embedding,
        });
    }

    async findSimilar(queryVector: number[], limit = 3) {
        // Calculamos la distancia entre el vector de la pregunta y los de la DB
        // A menor distancia, mayor similitud.
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