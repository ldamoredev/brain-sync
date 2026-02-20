// app/api/chat/stream/route.ts
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ✅ Changed from GET to POST
// GET + EventSource forced the prompt into the URL query string (~2000 char limit)
// POST + fetch allows a JSON body with no size constraints
export async function POST(req: NextRequest) {
    const { prompt } = await req.json();

    if (!prompt) {
        return new Response(
            JSON.stringify({ error: 'prompt is required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6060';

    const backendRes = await fetch(`${apiUrl}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
        // ✅ req.signal ensures that if the browser disconnects,
        // this fetch to the Express backend is also cancelled
        signal: req.signal,
    });

    // ✅ Previously missing — backend errors (400, 500) were piped through
    // as a 200 SSE response, making the frontend think streaming started normally
    if (!backendRes.ok) {
        const error = await backendRes.text();
        return new Response(error, { status: backendRes.status });
    }

    if (!backendRes.body) {
        return new Response('No backend stream', { status: 502 });
    }

    // Pipe the Express SSE stream straight through to the browser
    return new Response(backendRes.body, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}