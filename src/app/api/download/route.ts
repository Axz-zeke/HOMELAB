import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getActivePrimaryPool } from '@/lib/storage/registry';
import { mime } from '@/app/api/stream/mime-types';


/**
 * File Download API — forces Content-Disposition: attachment header for browser download.
 * Resolves logical paths against active primary storage pool.
 * Supports Range for large file resume.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const logicalPath = searchParams.get('path');

  if (!logicalPath || logicalPath.includes('..')) {
    return new NextResponse('Invalid or forbidden path', { status: 403 });
  }

  let physicalFilePath: string;
  let filename: string;

  try {
    const pool = await getActivePrimaryPool();
    const storageRoot = path.resolve(pool.targetDirectory);

    const cleanRel = logicalPath
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\.\./g, '');

    physicalFilePath = path.join(storageRoot, cleanRel);
    filename = path.basename(physicalFilePath);

    if (!physicalFilePath.toLowerCase().startsWith(storageRoot.toLowerCase())) {
      return new NextResponse('Access denied: Path outside storage root', { status: 403 });
    }
  } catch {
    return new NextResponse('No active storage pool configured', { status: 503 });
  }

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
  const encodedFilename = encodeURIComponent(filename);

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (!match) return new NextResponse('Invalid Range', { status: 416 });

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
    // @ts-ignore
    const webStream = ReadableStream.from(readStream);

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize.toString(),
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
      },
    });
  }

  const readStream = fs.createReadStream(physicalFilePath);
  // @ts-ignore
  const webStream = ReadableStream.from(readStream);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Length': fileSize.toString(),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
      'Cache-Control': 'no-cache',
    },
  });
}
