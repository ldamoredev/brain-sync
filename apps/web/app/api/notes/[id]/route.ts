import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const params = context.params;
    const { id } = await params;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:6060';

    if (!id) {
      return NextResponse.json({ error: 'Note ID is missing' }, { status: 400 });
    }

    const backendRes = await fetch(`${apiUrl}/notes/${id}`);

    if (!backendRes.ok) {
      const errorBody = await backendRes.json();
      return NextResponse.json(errorBody, { status: backendRes.status });
    }

    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in /api/notes/[id]:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
