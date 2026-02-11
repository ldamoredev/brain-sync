import { Request, Response, Router } from "express";
import { IndexNote } from "../../../application/services/IndexNote";
import { GetNotes } from "../../../application/services/GetNotes";
import { Controller } from "../interfaces/Controller";
import { validateRequest } from "../middleware/validateRequest";
import { createNoteSchema } from "@brain-sync/types";
import { AppError } from "../../../domain/errors/AppError";

export class NoteController implements Controller {
    public path = '/notes';
    public router = Router() as any;

    constructor(
        private indexNoteUseCase: IndexNote,
        private getNotesUseCase: GetNotes
    ) {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.post(`${this.path}`, validateRequest(createNoteSchema), this.create.bind(this));
        this.router.get(`${this.path}`, this.getAll.bind(this));
        this.router.get(`${this.path}/:id`, this.getById.bind(this));
    }

    async create(req: Request, res: Response) {
        const { content } = req.body;
        const note = await this.indexNoteUseCase.execute(content);
        return res.status(201).json({
            message: "Nota indexada correctamente",
            id: note.id
        });
    }

    async getAll(req: Request, res: Response) {
        const notes = await this.getNotesUseCase.getAll();
        res.json(notes);
    }

    async getById(req: Request, res: Response, next: any) {
        const note = await this.getNotesUseCase.getById(req.params.id as any);
        if (!note) {
            return next(new AppError('Note not found', 404));
        }
        res.json(note);
    }
}
