import type { Request, Response } from 'express';
import { ChatService } from '../../../application/services/ChatService';

export class ChatController {
    constructor(private chatService: ChatService) {}

    async handle(req: Request, res: Response) {
        const { question } = req.body;

        if (!question) {
            res.status(400).json({ error: 'question is required' });
            return;
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const stream = this.chatService.askStream(
            question,
            (sources) => {
                // metadata RAG al final
                res.write(
                    `\n\n<<META>>${JSON.stringify(sources)}<</META>>`
                );
            }
        );

        for await (const chunk of stream) {
            res.write(chunk);
        }

        res.end();
    }
}
