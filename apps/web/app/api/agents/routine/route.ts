import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6060';

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const backendRes = await fetch(`${apiUrl}/agents/routine/${date}`);

    if (!backendRes.ok) {
      if (backendRes.status === 404) {
        return NextResponse.json({ message: 'Not found' }, { status: 404 });
      }
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

    const backendRes = await fetch(`${apiUrl}/agents/routine`, {
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

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6060';

    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const backendRes = await fetch(`${apiUrl}/agents/routine/${date}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

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
