import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { resolvePhysicalDestination, ensureDirectoryExists } from '@/lib/storage/config';
import { logSystemEvent } from '@/lib/audit/logger';
import { AuditAction } from '@/lib/types';
import { checkQuota } from '@/lib/actions/quota';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/token';

export interface UploadResultItem {
  filename: string;
  success: boolean;
  sizeBytes: number;
  physicalPath?: string;
  driveLetter?: string;
  priority?: number;
  isCascaded?: boolean;
  error?: string;
}

/**
 * Batch Multipart File Upload Route Handler at /api/files/upload
 * 
 * Features:
 * - Accepts FormData containing single or multiple files (under field 'files' or 'file').
 * - Validates user quota prior to streaming bytes to physical disk.
 * - Streams file chunks using Node.js stream pipes (pipeline + fs.createWriteStream).
 * - Supports cascading storage pool allocation.
 * - Emits system audit log records for each uploaded file.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    // Extract all files (can be named 'files', 'files[]', or 'file')
    const rawFiles = [
      ...formData.getAll('files'),
      ...formData.getAll('files[]'),
      ...formData.getAll('file'),
    ].filter((item): item is File => item instanceof File && item.size > 0);

    const destinationPath = ((formData.get('destinationPath') as string) || '').trim();
    
    // Resolve user from verified session token
    const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    const sessionPayload = sessionCookie ? await verifySessionToken(sessionCookie) : null;
    const userId = sessionPayload?.userId || ((formData.get('userId') as string) || '').trim();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized: Valid session or credentials required.' },
        { status: 401 }
      );
    }

    if (rawFiles.length === 0) {
      return NextResponse.json(
        { error: 'No files provided in upload payload.' },
        { status: 400 }
      );
    }

    // Calculate total batch size
    const totalBatchBytes = rawFiles.reduce((sum, f) => sum + f.size, 0);

    // Global quota validation for user
    if (userId) {
      const quota = await checkQuota(userId, totalBatchBytes);
      if (!quota.allowed) {
        return NextResponse.json(
          {
            error: quota.error || 'Storage Quota Exceeded. Cannot complete batch upload.',
            code: 'QUOTA_EXCEEDED',
            formattedMessage: quota.formattedMessage,
            requiredBytes: quota.requiredBytes || totalBatchBytes,
            quotaBytes: quota.quotaBytes,
            usedBytes: quota.usedBytes,
            remainingBytes: quota.remainingBytes,
          },
          { status: 403 }
        );
      }
    }

    const results: UploadResultItem[] = [];

    for (const file of rawFiles) {
      const safeFilename = path.basename(file.name);

      try {
        // Resolve target pool & physical directory for this file
        const resolved = await resolvePhysicalDestination(destinationPath, safeFilename, file.size);
        const targetDir = resolved.dirPath;
        const finalPhysicalPath = resolved.filePath;
        const pool = resolved.pool;

        // Ensure physical target directory exists
        await ensureDirectoryExists(targetDir);

        // Pipe file stream directly to disk using Node streaming
        // @ts-ignore - web stream to node stream conversion
        const nodeReadable = Readable.fromWeb(file.stream());
        const writeStream = fs.createWriteStream(finalPhysicalPath);
        await pipeline(nodeReadable, writeStream);

        // Log audit event
        await logSystemEvent({
          userId,
          actionType: AuditAction.FILE_UPLOADED,
          targetPath: `${finalPhysicalPath} [Drive ${pool?.driveLetter || '?'}: (Priority ${pool?.priority || 1})${resolved.isCascaded ? ' - CASCADED' : ''}]`,
          ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        });

        results.push({
          filename: safeFilename,
          success: true,
          sizeBytes: file.size,
          physicalPath: finalPhysicalPath,
          driveLetter: pool?.driveLetter,
          priority: pool?.priority,
          isCascaded: resolved.isCascaded,
        });
      } catch (fileErr: any) {
        console.error(`[upload/batch] Failed to write file "${safeFilename}":`, fileErr);
        results.push({
          filename: safeFilename,
          success: false,
          sizeBytes: file.size,
          error: fileErr?.message || 'Failed to write file to physical storage',
        });
      }
    }

    const allSuccessful = results.every((r) => r.success);
    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: allSuccessful,
      totalCount: results.length,
      successCount,
      failureCount: results.length - successCount,
      results,
    });
  } catch (err: any) {
    const isClientDisconnect =
      err?.name === 'AbortError' ||
      err?.message?.includes('FormData') ||
      err?.cause?.message?.includes('CRLF') ||
      err?.code === 'ECONNRESET';

    if (isClientDisconnect) {
      console.warn('[upload/batch] Client upload aborted or disconnected:', err?.message);
      return NextResponse.json(
        { error: 'Upload interrupted: client connection closed or timed out prematurely.' },
        { status: 499 }
      );
    }

    console.error('[upload/batch] Unhandled error during upload processing:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error during upload processing.' },
      { status: 500 }
    );
  }
}
