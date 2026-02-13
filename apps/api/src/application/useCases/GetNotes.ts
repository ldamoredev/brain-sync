import { NoteRepository } from "../../domain/entities/NoteRepository";
import { Note } from "../../domain/entities/Note";
import { RepositoryProvider } from '../../infrastructure/repositories/RepositoryProvider';

export class GetNotes {
    constructor(private repositories: RepositoryProvider) {}

    async executeGetAll(): Promise<Note[]> {
        return this.repositories.get(NoteRepository).findAll();
    }

    async executeGetById(id: string): Promise<Note | undefined> {
        return this.repositories.get(NoteRepository).findById(id);
    }
}
