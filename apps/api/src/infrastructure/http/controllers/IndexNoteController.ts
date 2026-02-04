import type { Request, Response } from "express";
import { IndexNote } from "../../../application/services/IndexNote";

export class NoteController {
    // El controller recibe el CASO DE USO, no el repositorio ni la IA directamente
    constructor(private indexNoteUseCase: IndexNote) {}

    async handle(req: Request, res: Response) {
        // 1. El input ya está validado por el middleware validateRequest
        const { content } = req.body;

        // 2. Ejecutar el caso de uso
        const note = await this.indexNoteUseCase.execute(content);

        // 3. Responder al cliente
        return res.status(201).json({
            message: "Nota indexada correctamente",
            id: note.id
        });
    }
}
