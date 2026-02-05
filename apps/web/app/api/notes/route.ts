import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6060';

    const backendRes = await fetch(`${apiUrl}/notes`);

    if (!backendRes.ok) {
      const errorBody = await backendRes.json();
      return NextResponse.json(errorBody, { status: backendRes.status });
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6060';

    const backendRes = await fetch(`${apiUrl}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!backendRes.ok) {
      const errorBody = await backendRes.json();
      return NextResponse.json(errorBody, { status: backendRes.status });
    }

    const data = await backendRes.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
