import { Request, Response, Router } from 'express';
import { ChatService } from '../../../application/services/ChatService';
import { Controller } from '../interfaces/Controller';
import { validateRequest } from '../middleware/validateRequest';
import { askQuestionSchema } from '@brain-sync/types';

type StreamError =
    | { code: 'ABORTED' }
    | { code: 'RAG_ERROR'; message?: string }
    | { code: 'LLM_ERROR'; message?: string };

export class ChatController implements Controller {
    public path = '/ask';
    public router = Router() as any;

    constructor(private chatService: ChatService) {
        this.initializeRoutes();
    }

    private initializeRoutes() {
        this.router.post(`${this.path}`, validateRequest(askQuestionSchema), this.handle.bind(this));
    }

    async handle(req: Request, res: Response) {
        const { question } = req.body;

        // ─────────────────────────────────────────────
        // SSE headers
        // ─────────────────────────────────────────────
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const sendEvent = (event: string, data?: unknown) => {
            if (res.writableEnded) return;
            res.write(`event: ${event}\n`);
            if (data !== undefined) {
                res.write(`data: ${JSON.stringify(data)}\n`);
            }
            res.write('\n');
        };

        // ─────────────────────────────────────────────
        // Abort handling
        // ─────────────────────────────────────────────
        const abortController = new AbortController();
        
        const onClose = () => {
            // if (!abortController.signal.aborted) {
            //     abortController.abort();
            // }
        };

        req.on('close', onClose);

        // ─────────────────────────────────────────────
        // Heartbeat (anti proxy timeouts)
        // ─────────────────────────────────────────────
        const heartbeat = setInterval(() => {
            if (!res.writableEnded) {
                res.write(': ping\n\n');
            }
        }, 15_000);

        try {
            const stream = this.chatService.askStream(
                question,
                (sources) => {
                    sendEvent('meta', { sources });
                },
                { signal: abortController.signal }
            );

            for await (const chunk of stream) {
                if (abortController.signal.aborted) {
                    break;
                }
                sendEvent('token', chunk);
            }

            if (!abortController.signal.aborted) {
                sendEvent('done');
            }
        } catch (err) {
            if (!abortController.signal.aborted) {
                sendEvent('error', {
                    code: 'LLM_ERROR',
                    message: 'Failed generating response',
                } satisfies StreamError);
            }
        } finally {
            clearInterval(heartbeat);
            req.off('close', onClose);
            res.end();
        }
    }
}
