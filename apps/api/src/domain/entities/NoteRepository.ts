import { Note } from './Note';

export abstract class NoteRepository {
    abstract save(note: Note): Promise<void>;
    abstract findSimilar(queryVector: number[], limit: number, threshold: number): Promise<Note[]>;
    abstract findById(id: string): Promise<(Note | undefined)>;
    abstract findAll(): Promise<Note[]>;
}
