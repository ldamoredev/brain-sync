import { Note } from './Note';

export interface NoteRepository {
    save(note: Note): Promise<void>;
    findSimilar(queryVector: number[], limit: number, threshold: number): Promise<Note[]>
    findById(id: string): Promise<(Note | undefined)>
    findAll(): Promise<Note[]>
}
