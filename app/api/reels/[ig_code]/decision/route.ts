import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ig_code: string }> }
) {
  try {
    const { ig_code } = await params;
    const body = await request.json();
    const { owner_id, decision, note } = body;

    if (!owner_id || !decision) {
      return NextResponse.json(
        { error: 'owner_id and decision are required' },
        { status: 400 }
      );
    }

    if (!['keep', 'skip', 'later'].includes(decision)) {
      return NextResponse.json(
        { error: 'decision must be one of: keep, skip, later' },
        { status: 400 }
      );
    }

    // ig_reviewsテーブルの存在チェック
    const tableCheck = await query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'ig_reviews'
    `);
    
    if (tableCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'ig_reviews table does not exist. Please run the migration first.' },
        { status: 503 }
      );
    }

    const sql = `
      INSERT INTO public.ig_reviews(owner_id, ig_code, decision, note)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (owner_id, ig_code)
      DO UPDATE SET
        decision = EXCLUDED.decision,
        note = EXCLUDED.note,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await query<{
      id: number;
      owner_id: string;
      ig_code: string;
      decision: string;
      note: string | null;
      created_at: Date;
      updated_at: Date;
    }>(sql, [owner_id, ig_code, decision, note || null]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Failed to save decision' },
        { status: 500 }
      );
    }

    const review = result.rows[0];
    return NextResponse.json({
      id: review.id,
      owner_id: review.owner_id,
      ig_code: review.ig_code,
      decision: review.decision,
      note: review.note,
      created_at: review.created_at.toISOString(),
      updated_at: review.updated_at.toISOString(),
    });
  } catch (error) {
    console.error('Error saving decision:', error);
    return NextResponse.json(
      { error: 'Failed to save decision' },
      { status: 500 }
    );
  }
}
