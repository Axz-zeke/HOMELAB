import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { getChunkStagingDir, resolvePhysicalDestination, ensureDirectoryExists } from '@/lib/storage/config';
import { logSystemEvent } from '@/lib/audit/logger';
import { AuditAction } from '@/lib/types';
import { checkQuota } from '@/lib/actions/quota';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      uploadId: string;
      totalChunks: number;
      destinationPath?: string;
      filename: string;
      userId?: string;
      fileSizeBytes?: number;
    };

    const { uploadId, totalChunks, destinationPath, filename, userId, fileSizeBytes } = body;

    if (!uploadId || !totalChunks || !filename) {
      return NextResponse.json({ error: 'Missing required fields: uploadId, totalChunks, or filename' }, { status: 400 });
    }

    const safeUploadId = path.basename(uploadId.replace(/[^a-zA-Z0-9-_]/g, ''));
    const safeFilename = path.basename(filename);

    // 1. Resolve dynamic chunk staging buffer from database registry
    const stagingDir = await getChunkStagingDir();
    const uploadStagingDir = path.join(stagingDir, safeUploadId);

    try {
      await fs.access(uploadStagingDir);
    } catch {
      return NextResponse.json({ error: `Upload staging session '${safeUploadId}' not found on buffer drive.` }, { status: 404 });
    }

    // Inspect chunk files to verify completeness and total incoming file size
    let incomingBytes = fileSizeBytes || 0;
    const chunkPaths: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkFilename = `chunk_${String(i).padStart(6, '0')}`;
      const chunkPath = path.join(uploadStagingDir, chunkFilename);
      try {
        const stats = await fs.stat(chunkPath);
        if (!fileSizeBytes) incomingBytes += stats.size;
        chunkPaths.push(chunkPath);
      } catch {
        return NextResponse.json({ error: `Missing chunk ${i} in staging buffer.` }, { status: 400 });
      }
    }

    // 1.5 Enforce quota boundary for the user before writing to physical disk
    if (userId) {
      const quotaCheck = await checkQuota(userId, incomingBytes);
      if (!quotaCheck.allowed) {
        return NextResponse.json({
          error: quotaCheck.error || 'Storage Quota Exceeded',
        }, { status: 400 });
      }
    }

    // 2. Resolve target physical storage path using Dynamic Cascading Overflow Resolver
    let resolved;
    try {
      resolved = await resolvePhysicalDestination(destinationPath, safeFilename, incomingBytes);
    } catch (poolErr: any) {
      return NextResponse.json({
        error: poolErr?.message || 'Active storage drive is detached. Please mount a drive in Drive Management.',
      }, { status: 503 });
    }

    const { dirPath: targetDir, filePath: finalPhysicalPath, pool, isCascaded, cascadeReason } = resolved;

    // Recursively ensure target directory exists on active disk
    await ensureDirectoryExists(targetDir);

    // 3. Assemble all chunk slices sequentially into target stream
    const writeStream = createWriteStream(finalPhysicalPath);
    let totalBytesWritten = 0;

    for (const chunkPath of chunkPaths) {
      const chunkData = await fs.readFile(chunkPath);
      totalBytesWritten += chunkData.length;
      await pipeline(Readable.from(chunkData), writeStream, { end: false });
    }
    writeStream.end();

    // Clean up temporary staging buffer folder
    try {
      await fs.rm(uploadStagingDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn('[upload/assemble] Staging buffer cleanup warning:', cleanupErr);
    }

    // Audit log with cascading pool metadata
    await logSystemEvent({
      userId: userId || 'user-system',
      actionType: AuditAction.FILE_UPLOADED,
      targetPath: `${finalPhysicalPath} [Drive ${pool.driveLetter}: (Priority ${pool.priority})${isCascaded ? ' - CASCADED' : ''}]`,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });

    console.log(`[upload/assemble] Wrote file to ${pool.driveLetter}: (Priority ${pool.priority}): ${finalPhysicalPath} (${totalBytesWritten} bytes)${isCascaded ? ` [CASCADED: ${cascadeReason}]` : ''}`);

    return NextResponse.json({
      success: true,
      physicalPath: finalPhysicalPath,
      filename: safeFilename,
      bytesWritten: totalBytesWritten,
      targetDirectory: targetDir,
      driveLetter: pool.driveLetter,
      mountPath: pool.mountPath,
      priority: pool.priority,
      isCascaded,
      cascadeReason,
    });
  } catch (err: any) {
    console.error('[upload/assemble] Error assembling physical file:', err);
    return NextResponse.json({ error: err?.message || 'File assembly failed on physical storage' }, { status: 500 });
  }
}
