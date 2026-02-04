import type { NextRequest } from 'next/server';


export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const { prompt } = await req.json();

    const backendRes = await fetch('http://localhost:6060/ask', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question: prompt }),
    });

    if (!backendRes.body) {
        return new Response('No stream', { status: 500 });
    }

    return new Response(backendRes.body, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
        },
    });
}
