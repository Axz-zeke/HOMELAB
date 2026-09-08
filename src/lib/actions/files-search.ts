'use server';

import fs from 'fs/promises';
import path from 'path';
import { FileItem } from '@/lib/types';
import { getUserById } from '@/lib/users/db';

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  aac: 'audio/aac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  zip: 'application/zip',
  iso: 'application/x-iso9660-image',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  '7z': 'application/x-7z-compressed',
};

function getCategoryFromExt(ext: string): FileItem['category'] {
  const v = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'flv', 'ts'];
  const a = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'opus', 'wma'];
  const i = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'bmp', 'tiff', 'raw'];
  const d = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt'];
  const c = ['txt', 'md', 'json', 'ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'yaml', 'yml', 'xml', 'html', 'css', 'service', 'conf', 'log'];
  const ar = ['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'iso', 'img'];

  if (v.includes(ext)) return 'video';
  if (a.includes(ext)) return 'audio';
  if (i.includes(ext)) return 'image';
  if (d.includes(ext)) return 'document';
  if (c.includes(ext)) return 'code';
  if (ar.includes(ext)) return 'archive';
  return 'other';
}

let idCounter = 0;
function makeId() {
  return `search-${Date.now()}-${++idCounter}`;
}

/**
 * Recursively walks a directory collecting FileItems that match the query.
 * Stops at a reasonable depth and result cap to keep searches fast.
 */
async function walkAndSearch(
  dirPath: string,
  rootPath: string,
  query: string,
  results: FileItem[],
  depth: number = 0,
  maxResults: number = 50
): Promise<void> {
  if (depth > 6 || results.length >= maxResults) return;
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = '/' + path.relative(rootPath, fullPath).replace(/\\/g, '/');

      // Match check: name contains query (case-insensitive)
      const matches = query.trim() === '' || entry.name.toLowerCase().includes(query.toLowerCase());

      if (entry.isDirectory()) {
        if (matches) {
          try {
            const stat = await fs.stat(fullPath);
            results.push({
              id: makeId(),
              name: entry.name,
              path: relativePath,
              isDirectory: true,
              sizeBytes: 0,
              category: 'other',
              modifiedAt: stat.mtime,
            });
          } catch { /* skip */ }
        }
        // Always recurse into directories
        await walkAndSearch(fullPath, rootPath, query, results, depth + 1, maxResults);
      } else if (entry.isFile() && matches) {
        try {
          const stat = await fs.stat(fullPath);
          const ext = path.extname(entry.name).replace('.', '').toLowerCase();
          const mime = MIME_MAP[ext];
          results.push({
            id: makeId(),
            name: entry.name,
            path: relativePath,
            isDirectory: false,
            sizeBytes: stat.size,
            mimeType: mime,
            extension: ext || undefined,
            category: getCategoryFromExt(ext),
            modifiedAt: stat.mtime,
          });
        } catch { /* skip locked files */ }
      }
    }
  } catch { /* directory unreadable */ }
}

/**
 * Server Action: Searches the user's physical home directory on disk.
 * Returns real FileItem objects from stat() data — zero mock data.
 */
export async function searchFilesAction(
  userId: string,
  query: string
): Promise<FileItem[]> {
  try {
    const user = await getUserById(userId);
    if (!user?.home_directory_path) return [];

    const homeDir = user.home_directory_path;
    const results: FileItem[] = [];
    await walkAndSearch(homeDir, homeDir, query, results);
    return results;
  } catch (err) {
    console.error('[searchFilesAction] Error:', err);
    return [];
  }
}
