import { Request, Response, Router } from 'express';
import { TranscriptionService } from '../../../application/services/TranscriptionService';
import { Controller } from '../interfaces/Controller';
import multer from 'multer';
import os from 'os';

export class TranscriptionController implements Controller {
    public path = '/transcribe';
    public router = Router() as any;
    private upload = multer({ dest: os.tmpdir() });

    constructor(private transcriptionService: TranscriptionService) {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.post(`${this.path}`, this.upload.single('file'), this.handle.bind(this));
    }

    async handle(req: Request, res: Response) {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        try {
            const text = await this.transcriptionService.transcribe(req.file.path);
            res.json({ text });
        } catch (error) {
            console.error('Transcription failed:', error);
            res.status(500).json({ error: 'Failed to transcribe audio' });
        }
    }
}
