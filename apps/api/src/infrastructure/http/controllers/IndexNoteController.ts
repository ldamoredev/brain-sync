import type { Request, Response } from "express";
import { z } from "zod";
import { IndexNote } from "../../../application/services/IndexNote";

// Definimos el esquema de validación fuera de la clase para limpieza
const createNoteSchema = z.object({
    content: z.string().min(5, "La nota debe tener al menos 5 caracteres"),
});

export class NoteController {
    // El controller recibe el CASO DE USO, no el repositorio ni la IA directamente
    constructor(private indexNoteUseCase: IndexNote) {}

    async handle(req: Request, res: Response) {
        try {
            // 1. Validar el input (Zod es clave en 2026 para Type-safety)
            const { content } = createNoteSchema.parse(req.body);

            // 2. Ejecutar el caso de uso
            const note = await this.indexNoteUseCase.execute(content);

            // 3. Responder al cliente
            return res.status(201).json({
                message: "Nota indexada correctamente",
                id: note.id
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ errors: error.issues });
            }

            console.error(error);
            return res.status(500).json({ error: "Internal Server Error" });
        }
    }
}