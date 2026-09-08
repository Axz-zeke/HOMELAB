import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { resolvePhysicalDestination, ensureDirectoryExists } from '@/lib/storage/config';
import { logSystemEvent } from '@/lib/audit/logger';
import { AuditAction } from '@/lib/types';
import { checkQuota } from '@/lib/actions/quota';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const destinationPath = ((formData.get('destinationPath') as string) || '').trim();
    const userId = ((formData.get('userId') as string) || 'user-system').trim();

    if (!file) {
      return NextResponse.json({ error: 'No file provided in form-data' }, { status: 400 });
    }

    const filename = path.basename(file.name);

    // Enforce quota boundary for the user before writing to disk
    if (userId) {
      const quota = await checkQuota(userId, file.size);
      if (!quota.allowed) {
        return NextResponse.json(
          { error: quota.error || 'Storage Quota Exceeded' },
          { status: 403 }
        );
      }
    }

    // Resolve physical storage path from active database primary pool
    let targetDir: string;
    let finalPhysicalPath: string;
    let pool: any;
    let isCascaded = false;
    let cascadeReason: string | undefined;

    try {
      const resolved = await resolvePhysicalDestination(destinationPath, filename, file.size);
      targetDir = resolved.dirPath;
      finalPhysicalPath = resolved.filePath;
      pool = resolved.pool;
      isCascaded = resolved.isCascaded;
      cascadeReason = resolved.cascadeReason;
    } catch (poolErr: any) {
      return NextResponse.json({
        error: poolErr?.message || 'Active storage drive is detached. Please mount a drive in Drive Management.',
      }, { status: 503 });
    }

    // Ensure target directory exists on active disk
    await ensureDirectoryExists(targetDir);

    // Write file directly to physical disk
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(finalPhysicalPath, buffer);

    // Audit log
    await logSystemEvent({
      userId,
      actionType: AuditAction.FILE_UPLOADED,
      targetPath: `${finalPhysicalPath} [Drive ${pool?.driveLetter || '?'}: (Priority ${pool?.priority || 1})${isCascaded ? ' - CASCADED' : ''}]`,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });

    console.log(`[upload/direct] Physical file written to active pool: ${finalPhysicalPath} (${buffer.length} bytes)`);

    return NextResponse.json({
      success: true,
      physicalPath: finalPhysicalPath,
      filename,
      bytesWritten: buffer.length,
      targetDirectory: targetDir,
      driveLetter: pool?.driveLetter,
      priority: pool?.priority,
      isCascaded,
      cascadeReason,
    });
  } catch (err: any) {
    console.error('[upload/direct] Error writing file to disk:', err);
    return NextResponse.json({ error: err?.message || 'Failed to write file to disk' }, { status: 500 });
  }
}

