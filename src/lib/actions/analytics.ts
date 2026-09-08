'use server';

import fs from 'fs/promises';
import path from 'path';
import { getAllUsers } from '@/lib/users/db';
import { telemetryCache, CACHE_KEYS, CACHE_TTL } from '@/lib/cache/telemetry-cache';

// Map of file extension → category
const EXTENSION_CATEGORY_MAP: Record<string, string> = {
  // Video
  mp4: 'Videos', mkv: 'Videos', avi: 'Videos', mov: 'Videos', wmv: 'Videos',
  webm: 'Videos', m4v: 'Videos', flv: 'Videos', mts: 'Videos',
  // Images
  jpg: 'Photos', jpeg: 'Photos', png: 'Photos', gif: 'Photos', webp: 'Photos',
  heic: 'Photos', heif: 'Photos', svg: 'Photos', bmp: 'Photos', tiff: 'Photos',
  tif: 'Photos', raw: 'Photos', cr2: 'Photos', nef: 'Photos', arw: 'Photos',
  // Audio
  mp3: 'Audio', flac: 'Audio', wav: 'Audio', aac: 'Audio', ogg: 'Audio',
  m4a: 'Audio', opus: 'Audio', wma: 'Audio', aiff: 'Audio',
  // Documents
  pdf: 'Documents', doc: 'Documents', docx: 'Documents', xls: 'Documents',
  xlsx: 'Documents', ppt: 'Documents', pptx: 'Documents', odt: 'Documents',
  ods: 'Documents', odp: 'Documents', pages: 'Documents', numbers: 'Documents',
  keynote: 'Documents',
  // Code / Text
  txt: 'Code & Text', md: 'Code & Text', json: 'Code & Text', ts: 'Code & Text',
  tsx: 'Code & Text', js: 'Code & Text', jsx: 'Code & Text', py: 'Code & Text',
  sh: 'Code & Text', yaml: 'Code & Text', yml: 'Code & Text', xml: 'Code & Text',
  html: 'Code & Text', css: 'Code & Text', service: 'Code & Text', conf: 'Code & Text',
  log: 'Code & Text', ini: 'Code & Text', env: 'Code & Text',
  // Archives
  zip: 'Archives', tar: 'Archives', gz: 'Archives', bz2: 'Archives',
  xz: 'Archives', '7z': 'Archives', rar: 'Archives', iso: 'Archives',
  img: 'Archives',
};

const CATEGORY_COLORS: Record<string, string> = {
  Videos: '#6366f1',
  Photos: '#0ea5e9',
  Audio: '#10b981',
  Documents: '#f59e0b',
  'Code & Text': '#8b5cf6',
  Archives: '#f97316',
  Other: '#6b7280',
};

export interface FileCategoryBreakdown {
  name: string;
  bytes: number;
  color: string;
}

/**
 * Recursively scans a directory and aggregates file sizes by category.
 */
async function scanDirectoryByCategory(
  dirPath: string,
  totals: Record<string, number>,
  depth: number = 0
): Promise<void> {
  if (depth > 8) return; // safety cap on recursion depth
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          await scanDirectoryByCategory(fullPath, totals, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).replace('.', '').toLowerCase();
          const category = EXTENSION_CATEGORY_MAP[ext] ?? 'Other';
          const stat = await fs.stat(fullPath);
          totals[category] = (totals[category] ?? 0) + stat.size;
        }
      } catch {
        // skip locked / unreadable files
      }
    }
  } catch {
    // directory may not exist or be inaccessible
  }
}

/**
 * Server Action: Scans all active user home directories on disk and returns
 * real aggregated byte counts per file-type category for the analytics chart.
 */
export async function getStorageBreakdownAction(): Promise<FileCategoryBreakdown[]> {
  // ── Cache hit: skip the recursive scan entirely ──────────────────────────
  const cached = telemetryCache.get<FileCategoryBreakdown[]>(CACHE_KEYS.STORAGE_BREAKDOWN);
  if (cached) return cached;

  const users = await getAllUsers();
  const totals: Record<string, number> = {};

  // Scan all user home directories in parallel
  await Promise.all(
    users
      .filter((u) => u.home_directory_path)
      .map((u) => scanDirectoryByCategory(u.home_directory_path!, totals))
  );

  // Build sorted result (largest first), skip empty categories
  const result: FileCategoryBreakdown[] = Object.entries(totals)
    .filter(([, bytes]) => bytes > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, bytes]) => ({
      name,
      bytes,
      color: CATEGORY_COLORS[name] ?? CATEGORY_COLORS.Other,
    }));

  // ── Cache for 60 s — stale-by-a-minute is fine for an analytics chart ───
  telemetryCache.set(CACHE_KEYS.STORAGE_BREAKDOWN, result, CACHE_TTL.STORAGE_BREAKDOWN_MS);

  return result;
}
