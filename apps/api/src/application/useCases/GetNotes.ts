import { NoteRepository } from "../../domain/entities/NoteRepository";
import { Note } from "../../domain/entities/Note";
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class GetNotes {
    constructor(private repositories: RepositoryProvider) {}

    async getAll(): Promise<Note[]> {
        return this.repositories.get(NoteRepository).findAll();
    }

    async getById(id: string): Promise<Note | undefined> {
        return this.repositories.get(NoteRepository).findById(id);
    }
}
