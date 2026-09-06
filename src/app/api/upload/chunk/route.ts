import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getChunkStagingDir, ensureDirectoryExists } from '@/lib/storage/config';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = formData.get('chunkIndex') as string;
    const chunk = formData.get('chunk') as File;

    if (!uploadId || chunkIndex === null || !chunk) {
      return NextResponse.json({ error: 'Missing required fields: uploadId, chunkIndex, or chunk' }, { status: 400 });
    }

    const safeUploadId = path.basename(uploadId.replace(/[^a-zA-Z0-9-_]/g, ''));
    if (!safeUploadId) {
      return NextResponse.json({ error: 'Invalid uploadId format' }, { status: 400 });
    }

    // Dynamically query designated buffer staging drive from database registry
    const stagingBaseDir = await getChunkStagingDir();
    const uploadDir = path.join(stagingBaseDir, safeUploadId);
    await ensureDirectoryExists(uploadDir);

    const chunkFilename = `chunk_${chunkIndex.padStart(6, '0')}`;
    const chunkPath = path.join(uploadDir, chunkFilename);
    const buffer = Buffer.from(await chunk.arrayBuffer());
    await fs.writeFile(chunkPath, buffer);

    return NextResponse.json({
      success: true,
      chunkIndex: parseInt(chunkIndex, 10),
      uploadId: safeUploadId,
      bytesWritten: buffer.length,
      stagingPath: chunkPath,
    });
  } catch (err: any) {
    console.error('[upload/chunk] Error storing chunk on disk:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to store chunk on physical drive' },
      { status: 500 }
    );
  }
}
