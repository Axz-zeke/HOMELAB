'use server';

import fs from 'fs/promises';
import path from 'path';
import { getStorageRootPath, resolvePhysicalDestination, ensureDirectoryExists } from '@/lib/storage/config';
import { getStoragePoolRegistry } from '@/lib/storage/registry';
import { logSystemEvent } from '@/lib/audit/logger';
import { AuditAction } from '@/lib/types';
import { checkQuota } from '@/lib/actions/quota';

/**
 * Server Action: Writes a file buffer directly to the active physical storage pool (or cascading overflow drive).
 */
export async function writePhysicalFileAction(
  filename: string,
  base64Data: string,
  destinationPath?: string,
  userId: string = 'usr_superadmin'
): Promise<{
  success: boolean;
  physicalPath: string;
  bytesWritten: number;
  driveLetter?: string;
  priority?: number;
  isCascaded?: boolean;
  cascadeReason?: string;
  error?: string;
}> {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const safeFilename = path.basename(filename);

    // Enforce quota boundary for the user before writing to physical disk
    if (userId) {
      const quota = await checkQuota(userId, buffer.length);
      if (!quota.allowed) {
        return {
          success: false,
          physicalPath: '',
          bytesWritten: 0,
          error: quota.error || 'Storage Quota Exceeded',
        };
      }
    }

    const { dirPath: targetDir, filePath: finalPhysicalPath, pool, isCascaded, cascadeReason } =
      await resolvePhysicalDestination(destinationPath, safeFilename, buffer.length);

    // Recursively ensure target directory exists on active disk
    await ensureDirectoryExists(targetDir);

    await fs.writeFile(finalPhysicalPath, buffer);

    await logSystemEvent({
      userId,
      actionType: AuditAction.FILE_UPLOADED,
      targetPath: `${finalPhysicalPath} [Drive ${pool.driveLetter}: (Priority ${pool.priority})${isCascaded ? ' - CASCADED' : ''}]`,
      ipAddress: '127.0.0.1 (Local Server Action)',
    });

    return {
      success: true,
      physicalPath: finalPhysicalPath,
      bytesWritten: buffer.length,
      driveLetter: pool.driveLetter,
      priority: pool.priority,
      isCascaded,
      cascadeReason,
    };
  } catch (err: any) {
    console.error('[writePhysicalFileAction] Error writing physical file:', err);
    return {
      success: false,
      physicalPath: '',
      bytesWritten: 0,
      error: err?.message || 'Failed to write file to physical storage',
    };
  }
}

/**
 * Server Action: Lists physical files across all active Primary Storage pools (Priority 1, Priority 2, etc.),
 * unifying files across spanned/overflow drives while tracking each file's exact physical mount path.
 */
export async function listPhysicalFilesAction(subpath?: string) {
  try {
    const pools = await getStoragePoolRegistry();
    const primaryPools = pools
      .filter((p) => p.status === 'active' && p.type === 'primary')
      .sort((a, b) => (a.priority || 99) - (b.priority || 99));

    const cleanedSubpath = subpath
      ? subpath
          .replace(/^[a-zA-Z]:[\\\/]/, '')
          .replace(/^[\/\\]+/, '')
          .replace(/\.\./g, '')
          .replace(/[\/\\]+/g, path.sep)
      : '';

    const allItems: any[] = [];
    const seenNames = new Set<string>();

    for (const pool of primaryPools) {
      const dirPath = cleanedSubpath ? path.join(pool.targetDirectory, cleanedSubpath) : pool.targetDirectory;
      try {
        await ensureDirectoryExists(dirPath);
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!seenNames.has(entry.name)) {
            seenNames.add(entry.name);
            const fullPath = path.join(dirPath, entry.name);
            let size = 0;
            let mtime = new Date();
            try {
              const stats = await fs.stat(fullPath);
              size = stats.size;
              mtime = stats.mtime;
            } catch {}

            allItems.push({
              name: entry.name,
              path: fullPath,
              isDirectory: entry.isDirectory(),
              sizeBytes: size,
              modifiedAt: mtime,
              physicalMountPath: pool.targetDirectory,
              physicalDiskLetter: pool.driveLetter,
              priority: pool.priority,
            });
          }
        }
      } catch (poolReadErr) {
        console.warn(`[listPhysicalFilesAction] Could not read pool ${pool.driveLetter}:`, poolReadErr);
      }
    }

    return {
      success: true,
      directory: subpath || '/',
      storageRoot: primaryPools[0]?.targetDirectory || 'D:\\NAS_Storage',
      items: allItems,
    };
  } catch (err: any) {
    return {
      success: false,
      directory: '',
      storageRoot: await getStorageRootPath(),
      items: [],
      error: err?.message,
    };
  }
}
