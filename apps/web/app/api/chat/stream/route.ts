// app/api/chat/stream/route.ts
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const prompt = req.nextUrl.searchParams.get('prompt');

    if (!prompt) {
        return new Response('prompt is required', { status: 400 });
    }

    const backendRes = await fetch('http://localhost:6060/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
        signal: req.signal,
    });

    if (!backendRes.body) {
        return new Response('No backend stream', { status: 502 });
    }

    return new Response(backendRes.body, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
