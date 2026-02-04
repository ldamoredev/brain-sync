import { Note } from "../../domain/entities/Note";
import { DrizzleNoteRepository } from "../../infrastructure/repositories/DrizzleNoteRepository";
import type { VectorProvider } from "../providers/VectorProvider";
import { randomUUID } from "crypto";

export class IndexNote {
    constructor(
        private noteRepository: DrizzleNoteRepository,
        private vectorProvider: VectorProvider
    ) {}

    async execute(content: string): Promise<Note> {
        if (content.length < 5) {
            throw new Error("El contenido de la nota es demasiado corto.");
        }

        const embedding = await this.vectorProvider.generateEmbedding(content);

        const note = new Note(
            randomUUID(),
            content,
            embedding,
            new Date()
        );

        await this.noteRepository.save(note);

        return note;
    }
}