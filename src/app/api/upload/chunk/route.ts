import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getChunkStagingDir, ensureDirectoryExists } from '@/lib/storage/config';
import { checkQuota } from '@/lib/actions/quota';

/**
 * GET: Query received chunks for a given uploadId session.
 * Used for resumable transfers across network interruptions to determine
 * which chunks are already safely stored on physical disk.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get('uploadId');

    if (!uploadId) {
      return NextResponse.json({ error: 'Missing uploadId parameter' }, { status: 400 });
    }

    const safeUploadId = path.basename(uploadId.replace(/[^a-zA-Z0-9-_]/g, ''));
    if (!safeUploadId) {
      return NextResponse.json({ error: 'Invalid uploadId' }, { status: 400 });
    }

    const stagingBaseDir = await getChunkStagingDir();
    const uploadDir = path.join(stagingBaseDir, safeUploadId);

    try {
      await fs.access(uploadDir);
    } catch {
      return NextResponse.json({
        uploadId: safeUploadId,
        exists: false,
        receivedChunks: [],
        lastChunkIndex: -1,
        nextChunkIndex: 0,
        totalBytesReceived: 0,
      });
    }

    const files = await fs.readdir(uploadDir);
    const receivedChunks: number[] = [];
    let totalBytesReceived = 0;

    for (const f of files) {
      const match = f.match(/^chunk_(\d+)$/);
      if (match) {
        const idx = parseInt(match[1], 10);
        receivedChunks.push(idx);
        try {
          const stats = await fs.stat(path.join(uploadDir, f));
          totalBytesReceived += stats.size;
        } catch {}
      }
    }

    receivedChunks.sort((a, b) => a - b);
    const lastChunkIndex = receivedChunks.length > 0 ? Math.max(...receivedChunks) : -1;
    // Calculate first missing chunk or next sequential chunk
    let nextChunkIndex = 0;
    const chunkSet = new Set(receivedChunks);
    while (chunkSet.has(nextChunkIndex)) {
      nextChunkIndex++;
    }

    return NextResponse.json({
      success: true,
      uploadId: safeUploadId,
      exists: true,
      receivedChunks,
      lastChunkIndex,
      nextChunkIndex,
      totalBytesReceived,
    });
  } catch (err: any) {
    console.error('[upload/chunk] Error querying chunk session:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to inspect chunk session on server' },
      { status: 500 }
    );
  }
}

/**
 * POST: Upload and store an individual chunk slice.
 * Includes Active Chunk Quota Safeguard:
 * 1. Verifies physical staging drive space before writing chunk.
 * 2. Enforces user storage quota boundary before saving.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const uploadId = formData.get('uploadId') as string;
    const chunkIndex = formData.get('chunkIndex') as string;
    const chunk = formData.get('chunk') as File;
    const userId = (formData.get('userId') as string) || '';

    if (!uploadId || chunkIndex === null || !chunk) {
      return NextResponse.json(
        { error: 'Missing required fields: uploadId, chunkIndex, or chunk' },
        { status: 400 }
      );
    }

    const safeUploadId = path.basename(uploadId.replace(/[^a-zA-Z0-9-_]/g, ''));
    if (!safeUploadId) {
      return NextResponse.json({ error: 'Invalid uploadId format' }, { status: 400 });
    }

    const parsedChunkIndex = parseInt(chunkIndex, 10);
    if (isNaN(parsedChunkIndex) || parsedChunkIndex < 0) {
      return NextResponse.json({ error: 'Invalid chunkIndex' }, { status: 400 });
    }

    // 1. Resolve designated buffer staging drive from database registry
    const stagingBaseDir = await getChunkStagingDir();

    // 2. Active Physical Disk Safeguard: Check free space on staging drive
    try {
      const stats = await fs.statfs(stagingBaseDir);
      const freeSpaceBytes = stats.bsize * stats.bfree;
      // Safeguard: must have enough free space for this chunk + 20MB buffer
      if (freeSpaceBytes < chunk.size + 20 * 1024 * 1024) {
        return NextResponse.json(
          {
            error: 'Target staging storage drive is low on physical disk space.',
            code: 'DISK_FULL',
            freeSpaceBytes,
            requiredBytes: chunk.size,
          },
          { status: 507 }
        );
      }
    } catch (statErr) {
      console.warn('[upload/chunk] statfs check warning (continuing):', statErr);
    }

    // 3. Active User Quota Safeguard: Verify user quota mid-transfer
    if (userId) {
      const quota = await checkQuota(userId, chunk.size);
      if (!quota.allowed) {
        return NextResponse.json(
          {
            error: quota.error || 'Storage Quota Exceeded mid-transfer.',
            code: 'QUOTA_EXCEEDED',
            formattedMessage: quota.formattedMessage,
            requiredBytes: quota.requiredBytes || chunk.size,
            remainingBytes: quota.remainingBytes,
            quotaBytes: quota.quotaBytes,
          },
          { status: 403 }
        );
      }
    }

    const uploadDir = path.join(stagingBaseDir, safeUploadId);
    await ensureDirectoryExists(uploadDir);

    const chunkFilename = `chunk_${chunkIndex.padStart(6, '0')}`;
    const chunkPath = path.join(uploadDir, chunkFilename);
    const buffer = Buffer.from(await chunk.arrayBuffer());
    await fs.writeFile(chunkPath, buffer);

    return NextResponse.json({
      success: true,
      chunkIndex: parsedChunkIndex,
      uploadId: safeUploadId,
      bytesWritten: buffer.length,
      stagingPath: chunkPath,
      lastVerifiedIndex: parsedChunkIndex,
    });
  } catch (err: any) {
    console.error('[upload/chunk] Error storing chunk on disk:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to store chunk on physical drive' },
      { status: 500 }
    );
  }
}
