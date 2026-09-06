import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { resolvePhysicalDestination, ensureDirectoryExists } from '@/lib/storage/config';
import { logSystemEvent } from '@/lib/audit/logger';
import { AuditAction } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const destinationPath = (formData.get('destinationPath') as string) || '';
    const userId = (formData.get('userId') as string) || 'user-system';

    if (!file) {
      return NextResponse.json({ error: 'No file provided in form-data' }, { status: 400 });
    }

    const filename = path.basename(file.name);

    // Resolve physical storage path from active database primary pool
    let targetDir: string;
    let finalPhysicalPath: string;

    try {
      const resolved = await resolvePhysicalDestination(destinationPath, filename);
      targetDir = resolved.dirPath;
      finalPhysicalPath = resolved.filePath;
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
      targetPath: finalPhysicalPath,
      ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
    });

    console.log(`[upload/direct] Physical file written to active pool: ${finalPhysicalPath} (${buffer.length} bytes)`);

    return NextResponse.json({
      success: true,
      physicalPath: finalPhysicalPath,
      filename,
      bytesWritten: buffer.length,
      targetDirectory: targetDir,
    });
  } catch (err: any) {
    console.error('[upload/direct] Error writing file to disk:', err);
    return NextResponse.json({ error: err?.message || 'Failed to write file to disk' }, { status: 500 });
  }
}
