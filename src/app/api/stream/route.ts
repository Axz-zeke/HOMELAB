import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getActivePrimaryPool, getStoragePoolRegistry } from '@/lib/storage/registry';
import { mime } from '@/app/api/stream/mime-types';


/**
 * Secure streaming API supporting native Range requests for video/audio/image playback.
 * Resolves the logical path against the active primary storage pool root.
 * Blocks directory traversal attacks.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const logicalPath = searchParams.get('path');

  if (!logicalPath || logicalPath.includes('..')) {
    return new NextResponse('Invalid or forbidden path', { status: 403 });
  }

  // Resolve physical path from active primary pool
  let physicalFilePath: string;
  try {
    const pool = await getActivePrimaryPool();
    const storageRoot = path.resolve(pool.targetDirectory);

    // Normalize the logical path
    const cleanRel = logicalPath
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\.\./g, '');

    physicalFilePath = path.join(storageRoot, cleanRel);

    // Security: ensure the resolved path is still within storage root
    if (!physicalFilePath.toLowerCase().startsWith(storageRoot.toLowerCase())) {
      return new NextResponse('Access denied: Path outside storage root', { status: 403 });
    }
  } catch {
    return new NextResponse('No active storage pool configured', { status: 503 });
  }

  // Verify file exists
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(physicalFilePath);
    if (!stat.isFile()) {
      return new NextResponse('Not a file', { status: 400 });
    }
  } catch {
    return new NextResponse('File not found on physical storage', { status: 404 });
  }

  const ext = path.extname(physicalFilePath).toLowerCase().replace('.', '');
  const contentType = mime[ext] || 'application/octet-stream';
  const fileSize = stat.size;

  const rangeHeader = req.headers.get('range');

  if (rangeHeader) {
    // Parse Range: bytes=start-end
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      return new NextResponse('Invalid Range header', { status: 416 });
    }

    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    if (start > end || end >= fileSize) {
      return new NextResponse('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileSize}` },
      });
    }

    const readStream = fs.createReadStream(physicalFilePath, { start, end });
    // @ts-ignore – ReadableStream conversion for Next.js edge-compatible streams
    const webStream = ReadableStream.from(readStream);

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize.toString(),
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // Full file response (for images, documents)
  const readStream = fs.createReadStream(physicalFilePath);
  // @ts-ignore
  const webStream = ReadableStream.from(readStream);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Length': fileSize.toString(),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
