import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getS3Client() {
  return new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ig_code: string }> }
) {
  try {
    const { ig_code } = await params;

    const result = await query<{ video_r2_key: string }>(
      'SELECT video_r2_key FROM ig_jobs WHERE ig_code = $1 AND video_r2_key IS NOT NULL',
      [ig_code]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const { video_r2_key } = result.rows[0];

    // If R2_PUBLIC_URL is set, redirect directly
    if (process.env.R2_PUBLIC_URL) {
      return NextResponse.redirect(`${process.env.R2_PUBLIC_URL}/${video_r2_key}`);
    }

    // Otherwise generate a presigned URL (valid for 1 hour)
    const s3 = getS3Client();
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: video_r2_key,
    });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error('Error serving video:', error);
    return NextResponse.json({ error: 'Failed to serve video' }, { status: 500 });
  }
}
