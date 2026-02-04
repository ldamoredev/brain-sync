import { Note } from "../../domain/entities/Note";
import type { VectorProvider } from "../providers/VectorProvider";
import { randomUUID } from "crypto";
import { NoteRepository } from '../../domain/entities/NoteRepository';

export class IndexNote {
    constructor(
        private noteRepository: NoteRepository,
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