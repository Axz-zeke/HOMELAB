import path from 'path';
import fs from 'fs/promises';
import { getActiveUploadDrivePath, getActiveBufferPool } from '@/lib/storage/registry';
import { StoragePoolAllocation } from '@/lib/types';

/**
 * Resolves the physical storage root directory dynamically configured from the active database registry.
 * Inspects incomingBytes to automatically cascade to overflow priority pools if space is low (<5%).
 */
export async function getStorageRootPath(incomingBytes: number = 0): Promise<string> {
  try {
    const uploadPath = await getActiveUploadDrivePath(incomingBytes);
    if (uploadPath && uploadPath.storageRoot) {
      return uploadPath.storageRoot;
    }
  } catch (err) {
    console.warn('[config] Could not fetch active upload drive path:', err);
  }

  const envPath = process.env.STORAGE_ROOT_PATH;
  if (envPath && envPath.trim() !== '') {
    return path.resolve(envPath.trim());
  }
  return path.resolve('D:\\NAS_Storage');
}

/**
 * Resolves the temporary upload chunk staging buffer directory dynamically from the active database registry.
 * Falls back to process.env.CHUNK_STAGING_DIR, or 'D:\temp_uploads'.
 */
export async function getChunkStagingDir(): Promise<string> {
  try {
    const activeBuffer = await getActiveBufferPool();
    if (activeBuffer && activeBuffer.targetDirectory) {
      return path.resolve(activeBuffer.targetDirectory);
    }
  } catch (err) {
    console.warn('[config] Could not fetch active buffer pool from registry:', err);
  }

  const envPath = process.env.CHUNK_STAGING_DIR;
  if (envPath && envPath.trim() !== '') {
    return path.resolve(envPath.trim());
  }
  return path.resolve('D:\\temp_uploads');
}

/**
 * Synchronous fallback for legacy or non-async callers.
 */
export function getStorageRootPathSync(): string {
  const envPath = process.env.STORAGE_ROOT_PATH;
  if (envPath && envPath.trim() !== '') {
    return path.resolve(envPath.trim());
  }
  return path.resolve('D:\\NAS_Storage');
}

export function getChunkStagingDirSync(): string {
  const envPath = process.env.CHUNK_STAGING_DIR;
  if (envPath && envPath.trim() !== '') {
    return path.resolve(envPath.trim());
  }
  return path.resolve('D:\\temp_uploads');
}

/**
 * Recursively creates a target directory if it doesn't already exist.
 */
export async function ensureDirectoryExists(dirPath: string): Promise<string> {
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

/**
 * Resolves a client logical destination path into an absolute physical path
 * on the active primary storage pool disk.
 * Uses getActiveUploadDrivePath to support Cascading Overflow Pools.
 */
export async function resolvePhysicalDestination(
  destinationPath?: string,
  filename?: string,
  incomingBytes: number = 0
): Promise<{
  dirPath: string;
  filePath: string;
  rootPath: string;
  pool: StoragePoolAllocation;
  isCascaded: boolean;
  cascadeReason?: string;
}> {
  const uploadInfo = await getActiveUploadDrivePath(incomingBytes);
  const root = uploadInfo.storageRoot;

  let subpath = '';
  if (destinationPath) {
    const norm = path.normalize(destinationPath);
    if (norm.toLowerCase().startsWith(root.toLowerCase())) {
      subpath = norm.substring(root.length).replace(/^[\/\\]+/, '');
    } else {
      const cleaned = destinationPath
        .replace(/^[a-zA-Z]:[\\\/]/, '')
        .replace(/^[\/\\]+/, '')
        .replace(/\.\./g, '')
        .replace(/[\/\\]+/g, path.sep);

      subpath = cleaned;
    }
  }

  const dirPath = subpath ? path.join(/*turbopackIgnore: true*/ root, subpath) : root;
  const filePath = filename ? path.join(/*turbopackIgnore: true*/ dirPath, path.basename(filename)) : dirPath;

  return {
    dirPath,
    filePath,
    rootPath: root,
    pool: uploadInfo.pool,
    isCascaded: uploadInfo.isCascaded,
    cascadeReason: uploadInfo.cascadeReason,
  };
}
