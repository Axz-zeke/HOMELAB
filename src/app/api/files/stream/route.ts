import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { getActivePrimaryPool } from '@/lib/storage/registry';
import { mime } from '@/app/api/stream/mime-types';
import { validatePathAccess } from '@/lib/rbac/path-validator';
import { getUserById } from '@/lib/users/db';
import { UserRole } from '@/lib/types';
import { verifySessionToken } from '@/lib/auth/token';

/**
 * Physical File Streaming Route Handler at /api/files/stream
 * 
 * Features:
 * 1. Security & RBAC: Validates session via userId param/header/cookie with validatePathAccess().
 * 2. Traversal Prevention: Blocks path traversal attacks ("..") and confines files within storage pools.
 * 3. Accurate MIME & Headers: Sets appropriate Content-Type for images, videos, audio, documents, and code.
 * 4. HTTP Range Requests (206 Partial Content): Enables smooth seeking for HTML5 video/audio playback.
 * 5. High-Performance Streaming: Pipes raw physical disk files via fs.createReadStream().
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Decode first to handle double-encoded paths (%2F → /) before any processing
  const rawPath = searchParams.get('path');
  const logicalPath = rawPath ? decodeURIComponent(rawPath) : null;

  if (!logicalPath || logicalPath.includes('..')) {
    return new NextResponse('Invalid or forbidden path segment', { status: 403 });
  }

  // 1. Identify User Session for RBAC access control
  let targetUserId = searchParams.get('userId') || req.headers.get('x-user-id');

  if (!targetUserId) {
    const sessionToken = req.cookies.get('auth_session')?.value || req.cookies.get('session_token')?.value;
    if (sessionToken) {
      const verified = await verifySessionToken(sessionToken);
      if (verified) targetUserId = verified.userId;
    }
    if (!targetUserId) {
      targetUserId = req.cookies.get('homelab_active_user_id')?.value || null;
    }
  }

  if (!targetUserId) {
    return new NextResponse('Authentication required: user session not found', { status: 401 });
  }

  const user = await getUserById(targetUserId);
  if (!user || user.isLocked) {
    return new NextResponse('Authentication required: invalid user session', { status: 401 });
  }

  // 2. Validate RBAC access to the requested path
  const normalizedLogicalPath = logicalPath.startsWith('/') ? logicalPath : `/${logicalPath}`;
  const access = validatePathAccess(user, normalizedLogicalPath, 'read');
  if (!access.allowed) {
    return new NextResponse(`Access Denied: ${access.reason || 'Forbidden'}`, { status: 403 });
  }

  // 3. Resolve physical file path on the primary storage pool
  let physicalFilePath: string;
  let storageRoot: string;

  try {
    const pool = await getActivePrimaryPool();
    storageRoot = path.resolve(pool.targetDirectory);

    // Normalize logical path
    const cleanRel = logicalPath
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\.\./g, '');

    const isPrivileged = user.role === UserRole.SUPERADMIN || user.role === UserRole.ADMIN;

    if (isPrivileged) {
      physicalFilePath = path.resolve(storageRoot, cleanRel);
      if (!physicalFilePath.toLowerCase().startsWith(storageRoot.toLowerCase())) {
        return new NextResponse('Access denied: Path outside storage root', { status: 403 });
      }
    } else {
      // Standard user home directory resolution
      const username = (user.username || user.name || user.id).toLowerCase();
      const userHomePhysical = user.home_directory_path
        ? path.resolve(user.home_directory_path)
        : path.resolve(storageRoot, `user_homes/${username}`);

      if (cleanRel.startsWith('shared')) {
        physicalFilePath = path.resolve(storageRoot, cleanRel);
        if (!physicalFilePath.toLowerCase().startsWith(storageRoot.toLowerCase())) {
          return new NextResponse('Access denied: Path outside storage root', { status: 403 });
        }
      } else {
        // Strip user home prefixes if present in requested path
        let userSubpath = cleanRel;
        const prefixes = [
          `user_homes/${username}`,
          `home/${username}`,
          `user_homes/${user.id.toLowerCase()}`,
          `home/${user.id.toLowerCase()}`,
        ];
        for (const p of prefixes) {
          if (userSubpath.toLowerCase().startsWith(p)) {
            userSubpath = userSubpath.substring(p.length).replace(/^[\/\\]+/, '');
            break;
          }
        }

        physicalFilePath = path.resolve(userHomePhysical, userSubpath);

        // If file doesn't exist under user home, check directly under storageRoot
        let exists = false;
        try {
          await fsp.access(physicalFilePath);
          exists = true;
        } catch {
          const directRootPath = path.resolve(storageRoot, cleanRel);
          if (directRootPath.toLowerCase().startsWith(storageRoot.toLowerCase())) {
            try {
              await fsp.access(directRootPath);
              physicalFilePath = directRootPath;
              exists = true;
            } catch {}
          }
        }

        if (!exists && !physicalFilePath.toLowerCase().startsWith(userHomePhysical.toLowerCase())) {
          return new NextResponse('Access Denied: Path outside your workspace', { status: 403 });
        }
      }
    }
  } catch {
    return new NextResponse('No active storage pool configured', { status: 503 });
  }

  // 4. Verify file exists on disk
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(physicalFilePath);
    if (!stat.isFile()) {
      return new NextResponse('Requested path is not a file', { status: 400 });
    }
  } catch {
    return new NextResponse('File not found on physical storage', { status: 404 });
  }

  // 5. Determine MIME type and file sizing
  const ext = path.extname(physicalFilePath).toLowerCase().replace('.', '');
  const contentType = mime[ext] || 'application/octet-stream';
  const fileSize = stat.size;

  // 6. Handle HTTP Range Requests (206 Partial Content) for smooth video/audio seeking
  const rangeHeader = req.headers.get('range');

  if (rangeHeader) {
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
    // @ts-ignore - ReadableStream conversion for edge/Node response streaming
    const webStream = ReadableStream.from(readStream);

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize.toString(),
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  }

  // 7. Full file stream response (200 OK)
  const readStream = fs.createReadStream(physicalFilePath);
  // @ts-ignore
  const webStream = ReadableStream.from(readStream);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      'Content-Length': fileSize.toString(),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
