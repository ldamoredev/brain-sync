import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6060';
    const targetUrl = `${apiUrl}/transcribe`;

    console.log(`[Proxy] Forwarding transcription request to: ${targetUrl}`);

    const backendRes = await fetch(targetUrl, {
      method: 'POST',
      body: formData,
    });

    if (!backendRes.ok) {
      const text = await backendRes.text();
      console.error(`[Proxy] Backend error (${backendRes.status}):`, text);
      try {
          const json = JSON.parse(text);
          return NextResponse.json(json, { status: backendRes.status });
      } catch {
          return NextResponse.json({ error: `Backend error: ${backendRes.status}`, details: text }, { status: backendRes.status });
      }
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Proxy transcription error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
