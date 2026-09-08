'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getActivePrimaryPool, getStoragePoolRegistry } from '@/lib/storage/registry';
import { logSystemEvent } from '@/lib/audit/logger';
import { AuditAction, FileItem, FileCategory, UserRole } from '@/lib/types';
import { getUserById } from '@/lib/users/db';
import { getSessionUser } from '@/lib/auth/session';

function inferCategory(filename: string): FileCategory {
  const ext = path.extname(filename).replace('.', '').toLowerCase();
  if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image';
  if (['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'go', 'rs', 'html', 'css', 'sql', 'md', 'sh', 'yaml', 'yml'].includes(ext)) return 'code';
  if (['zip', 'tar', 'gz', '7z', 'rar', 'iso'].includes(ext)) return 'archive';
  return 'document';
}

/**
 * Normalizes and guards against directory traversal attacks.
 */
function sanitizePathSegment(segment: string): string {
  return segment
    .replace(/^[a-zA-Z]:[\\\/]/, '')
    .replace(/^[\/\\]+/, '')
    .replace(/\.\./g, '')
    .replace(/[<>:"|?*]/g, '_');
}

/**
 * Server Action: Reads real directory contents from physical storage on disk.
 * Uses fs.readdir({ withFileTypes: true }) and fs.stat to query live metadata.
 */
export async function readDirectoryContents(
  relativePath: string = '',
  userId?: string
): Promise<{
  success: boolean;
  currentPath: string;
  physicalPath: string;
  storageDrive: string;
  breadcrumbs: { name: string; path: string }[];
  items: FileItem[];
  error?: string;
}> {
  try {
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        return {
          success: false,
          currentPath: relativePath,
          physicalPath: '',
          storageDrive: '',
          breadcrumbs: [],
          items: [],
          error: 'Unauthorized: No active session found.',
        };
      }
      effectiveUserId = sessionUser.id;
    }

    const primaryPool = await getActivePrimaryPool();
    const storageRoot = path.resolve(primaryPool.targetDirectory);

    // Find requesting user from dynamic database for RBAC enforcement
    const user = await getUserById(effectiveUserId);
    const role = user?.role || UserRole.USER;
    const isPrivileged = role === UserRole.SUPERADMIN || role === UserRole.ADMIN;
    const username = user?.username || effectiveUserId;

    // Normalize requested relative path
    let cleanRel = (relativePath || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim();
    if (cleanRel.startsWith('/')) cleanRel = cleanRel.substring(1);
    if (cleanRel.endsWith('/')) cleanRel = cleanRel.slice(0, -1);

    // Prevent directory traversal
    if (cleanRel.includes('..')) {
      return {
        success: false,
        currentPath: '/',
        physicalPath: storageRoot,
        storageDrive: primaryPool.driveLetter,
        breadcrumbs: [{ name: 'Home', path: '/' }],
        items: [],
        error: 'Path traversal attempt blocked (".." is forbidden).',
      };
    }

    let targetPhysicalDir: string;
    let logicalDisplayPath: string;

    if (isPrivileged) {
      // Superadmin / Admin can browse storage root or any subfolder
      if (!cleanRel) {
        targetPhysicalDir = storageRoot;
        logicalDisplayPath = '/';
      } else {
        targetPhysicalDir = path.resolve(storageRoot, cleanRel);
        logicalDisplayPath = `/${cleanRel}`;
      }
    } else {
      // Standard User: personal home directory OR shared folder view
      const userHomePhysical = user?.home_directory_path
        ? path.resolve(user.home_directory_path)
        : path.resolve(storageRoot, `user_homes/${username}`);

      if (cleanRel.startsWith('shared')) {
        targetPhysicalDir = path.resolve(storageRoot, cleanRel);
        logicalDisplayPath = `/${cleanRel}`;

        // Verify target is within storage root
        if (!targetPhysicalDir.toLowerCase().startsWith(storageRoot.toLowerCase())) {
          return {
            success: false,
            currentPath: '/shared',
            physicalPath: storageRoot,
            storageDrive: primaryPool.driveLetter,
            breadcrumbs: [{ name: 'Home', path: '/' }, { name: 'shared', path: '/shared' }],
            items: [],
            error: 'Access Denied: Invalid shared path.',
          };
        }
      } else if (!cleanRel || cleanRel === `user_homes/${username}` || cleanRel === `home/${username}` || cleanRel === `home/${userId}`) {
        targetPhysicalDir = userHomePhysical;
        logicalDisplayPath = `/`;
      } else {
        // Strip any user_homes prefix if passed
        let userSubpath = cleanRel;
        if (userSubpath.startsWith(`user_homes/${username}`)) {
          userSubpath = userSubpath.replace(`user_homes/${username}`, '').replace(/^[\/\\]+/, '');
        } else if (userSubpath.startsWith(`home/${username}`)) {
          userSubpath = userSubpath.replace(`home/${username}`, '').replace(/^[\/\\]+/, '');
        } else if (userSubpath.startsWith(`home/${userId}`)) {
          userSubpath = userSubpath.replace(`home/${userId}`, '').replace(/^[\/\\]+/, '');
        }

        targetPhysicalDir = path.resolve(userHomePhysical, userSubpath);
        logicalDisplayPath = userSubpath ? `/${userSubpath}` : '/';
      }

      // Traversal boundary check for home directory browsing
      if (!cleanRel.startsWith('shared') && !targetPhysicalDir.toLowerCase().startsWith(userHomePhysical.toLowerCase())) {
        return {
          success: false,
          currentPath: '/',
          physicalPath: userHomePhysical,
          storageDrive: primaryPool.driveLetter,
          breadcrumbs: [{ name: 'Home', path: '/' }],
          items: [],
          error: 'Access Denied: You cannot browse outside your personal home directory.',
        };
      }
    }

    // Verify target directory exists — strictly read-only, never create on navigation.
    // Directory creation is handled exclusively by account provisioning (createUserAction).
    try {
      await fs.access(targetPhysicalDir);
    } catch {
      // Build minimal breadcrumbs inline for the error response
      const errorCrumbs: { name: string; path: string }[] = [{ name: 'Home', path: '/' }];
      if (logicalDisplayPath !== '/') {
        const parts = logicalDisplayPath.split('/').filter(Boolean);
        let cum = '';
        for (const part of parts) {
          cum += `/${part}`;
          errorCrumbs.push({ name: part, path: cum });
        }
      }
      return {
        success: false,
        currentPath: logicalDisplayPath,
        physicalPath: targetPhysicalDir,
        storageDrive: primaryPool.driveLetter,
        breadcrumbs: errorCrumbs,
        items: [],
        error: `Directory not found on physical disk: ${targetPhysicalDir}. It may not have been provisioned yet.`,
      };
    }

    // Read live directory contents from host disk
    const dirents = await fs.readdir(/*turbopackIgnore: true*/ targetPhysicalDir, { withFileTypes: true });

    // ── Parallel stat: all N stat() calls run concurrently instead of serially ──
    //    Time = max(single_stat_latency) instead of sum(all_stat_latencies)
    const itemResults = await Promise.all(
      dirents
        .filter((d) => !d.name.startsWith('.') && d.name !== 'Thumbs.db')
        .map(async (dirent) => {
          const fullItemPath = path.join(targetPhysicalDir, dirent.name);
          let sizeBytes = 0;
          let modifiedAt = new Date();

          try {
            const stats = await fs.stat(fullItemPath);
            sizeBytes = dirent.isDirectory() ? 0 : stats.size;
            modifiedAt = stats.mtime;
          } catch {
            // file locked or inaccessible
          }

          const itemLogicalPath = logicalDisplayPath === '/'
            ? `/${dirent.name}`
            : `${logicalDisplayPath}/${dirent.name}`;

          return {
            id: `file-${dirent.name}-${modifiedAt.getTime()}`,
            name: dirent.name,
            path: itemLogicalPath,
            isDirectory: dirent.isDirectory(),
            sizeBytes,
            extension: dirent.isDirectory() ? undefined : path.extname(dirent.name).replace('.', '').toLowerCase(),
            category: dirent.isDirectory() ? ('other' as any) : inferCategory(dirent.name),
            modifiedAt,
            driveVolumeId: `vol-${primaryPool.driveLetter}`,
            physicalMountPath: targetPhysicalDir,
            physicalDiskLetter: primaryPool.driveLetter,
          } satisfies FileItem;
        })
    );

    const items: FileItem[] = itemResults;

    // Sort: Folders first (A-Z), then Files (A-Z)
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Construct breadcrumb trail
    const breadcrumbs: { name: string; path: string }[] = [{ name: 'Home', path: '/' }];
    if (logicalDisplayPath !== '/') {
      const parts = logicalDisplayPath.split('/').filter(Boolean);
      let cumulativePath = '';
      for (const part of parts) {
        cumulativePath += `/${part}`;
        breadcrumbs.push({
          name: part,
          path: cumulativePath,
        });
      }
    }

    return {
      success: true,
      currentPath: logicalDisplayPath,
      physicalPath: targetPhysicalDir,
      storageDrive: primaryPool.driveLetter,
      breadcrumbs,
      items,
    };
  } catch (err: any) {
    console.error('[readDirectoryContents] Error scanning disk:', err);
    return {
      success: false,
      currentPath: '/',
      physicalPath: '',
      storageDrive: '',
      breadcrumbs: [{ name: 'Home', path: '/' }],
      items: [],
      error: err?.message || 'Failed to read directory from physical drive.',
    };
  }
}

/**
 * Server Action: Creates a real physical directory on disk using fs.mkdir(dir, { recursive: true }).
 */
export async function createPhysicalDirectory(
  parentRelativePath: string,
  folderName: string,
  userId?: string
): Promise<{ success: boolean; folderPath?: string; error?: string }> {
  try {
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        return { success: false, error: 'Unauthorized: No active session found.' };
      }
      effectiveUserId = sessionUser.id;
    }

    const cleanFolderName = folderName.trim().replace(/[<>:"/\\|?*]/g, '_');
    if (!cleanFolderName || cleanFolderName === '.' || cleanFolderName === '..') {
      return { success: false, error: 'Invalid folder name.' };
    }

    const primaryPool = await getActivePrimaryPool();
    const storageRoot = path.resolve(primaryPool.targetDirectory);

    const user = await getUserById(effectiveUserId);
    const role = user?.role || UserRole.USER;
    const isPrivileged = role === UserRole.SUPERADMIN || role === UserRole.ADMIN;
    const username = user?.username || effectiveUserId;

    let cleanRel = (parentRelativePath || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim();
    if (cleanRel.startsWith('/')) cleanRel = cleanRel.substring(1);

    let baseDir: string;
    if (isPrivileged) {
      baseDir = cleanRel ? path.resolve(storageRoot, cleanRel) : storageRoot;
    } else {
      const userHome = user?.home_directory_path
        ? path.resolve(user.home_directory_path)
        : path.resolve(storageRoot, `user_homes/${username}`);
      let userSub = cleanRel.replace(`user_homes/${username}`, '').replace(/^[\/\\]+/, '');
      baseDir = path.resolve(userHome, userSub);
      if (!baseDir.toLowerCase().startsWith(userHome.toLowerCase())) {
        return { success: false, error: 'Cannot create folder outside your home directory.' };
      }
    }

    const fullNewFolderPath = path.join(baseDir, cleanFolderName);
    await fs.mkdir(fullNewFolderPath, { recursive: true });

    await logSystemEvent({
      userId: effectiveUserId,
      actionType: AuditAction.FILE_UPLOADED,
      targetPath: fullNewFolderPath,
      ipAddress: '127.0.0.1 (Create Folder)',
    });

    revalidatePath('/dashboard');
    revalidatePath('/dashboard/files');
    return { success: true, folderPath: fullNewFolderPath };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create directory on disk.' };
  }
}

/**
 * Server Action: Archive / Recycle a file or folder.
 * Supports both files and directories via recursive copy+remove.
 * Moves items from Primary Storage to the Archive pool's Recycle_Bin.
 */
export async function archiveFileAction(
  fileRelativePath: string,
  filename: string,
  userId?: string
): Promise<{ success: boolean; archivedPath?: string; error?: string }> {
  try {
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const sessionUser = await getSessionUser();
      if (!sessionUser) {
        return { success: false, error: 'Unauthorized: No active session found.' };
      }
      effectiveUserId = sessionUser.id;
    }

    const primaryPool = await getActivePrimaryPool();
    const storageRoot = path.resolve(primaryPool.targetDirectory);

    const user = await getUserById(effectiveUserId);
    const role = user?.role || UserRole.USER;
    const isPrivileged = role === UserRole.SUPERADMIN || role === UserRole.ADMIN;
    const username = user?.username || effectiveUserId;

    let cleanRel = (fileRelativePath || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim();
    if (cleanRel.startsWith('/')) cleanRel = cleanRel.substring(1);

    // ── 1. Resolve the parent directory on disk ────────────────────────────
    let parentPhysical: string;
    if (isPrivileged) {
      parentPhysical = cleanRel ? path.resolve(storageRoot, cleanRel) : storageRoot;
    } else {
      const userHome = user?.home_directory_path
        ? path.resolve(user.home_directory_path)
        : path.resolve(storageRoot, `user_homes/${username}`);
      const userSub = cleanRel
        .replace(`user_homes/${username}`, '')
        .replace(/^[\/\\]+/, '');
      parentPhysical = path.resolve(userHome, userSub);

      // RBAC boundary: prevent deleting outside home directory
      if (!parentPhysical.toLowerCase().startsWith(userHome.toLowerCase())) {
        return { success: false, error: 'Access Denied: Cannot delete items outside your home directory.' };
      }
    }

    // ── 2. Build full source path ──────────────────────────────────────────
    const cleanName = filename.trim();
    if (!cleanName || cleanName === '.' || cleanName === '..') {
      return { success: false, error: 'Invalid item name.' };
    }
    const sourcePhysical = path.join(parentPhysical, cleanName);
    console.log(`[archiveFileAction] source="${sourcePhysical}" | isPrivileged=${isPrivileged} | user=${username}`);


    // ── 3. Stat — confirm existence & detect file vs directory ────────────
    let sourceStat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      sourceStat = await fs.stat(sourcePhysical);
    } catch (statErr: any) {
      if (statErr?.code === 'ENOENT') {
        return { success: false, error: `"${cleanName}" was not found on disk. It may have already been removed.` };
      }
      return { success: false, error: `Cannot access "${cleanName}": ${statErr.message}` };
    }
    const isDirectory = sourceStat.isDirectory();

    // ── 4. Determine archive destination directory ─────────────────────────
    const pools = await getStoragePoolRegistry();
    const archivePool = pools.find((p) => p.status === 'active' && p.type === 'archive');

    let destinationDir: string;
    if (archivePool) {
      destinationDir = path.join(archivePool.targetDirectory, 'Recycle_Bin', effectiveUserId);
    } else {
      // Fallback: recycle bin inside primary pool
      destinationDir = path.join(storageRoot, '.recycle_bin', effectiveUserId);
    }

    // Timestamp-prefix prevents name collisions in the bin
    const archiveName = `${Date.now()}_${cleanName}`;
    const destinationPath = path.join(destinationDir, archiveName);

    // Ensure destination parent exists
    await fs.mkdir(destinationDir, { recursive: true });

    // ── 5. Move: fast same-device rename, or cross-device copy+remove ─────
    try {
      await fs.rename(sourcePhysical, destinationPath);
    } catch {
      // EXDEV (cross-device) or other rename failure — fall back to cp + rm
      if (isDirectory) {
        await fs.cp(sourcePhysical, destinationPath, { recursive: true });
        await fs.rm(sourcePhysical, { recursive: true, force: true });
      } else {
        await fs.copyFile(sourcePhysical, destinationPath);
        await fs.unlink(sourcePhysical);
      }
    }

    // ── 6. Audit log ──────────────────────────────────────────────────────
    await logSystemEvent({
      userId: effectiveUserId,
      actionType: AuditAction.FILE_DELETED,
      targetPath: `${sourcePhysical} ➔ ${destinationPath}`,
      ipAddress: `127.0.0.1 (Archive — ${isDirectory ? 'Directory' : 'File'})`,
    });

    // ── 7. Invalidate Next.js cache so the UI updates without a full refresh ─
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/files');

    return { success: true, archivedPath: destinationPath };
  } catch (err: any) {
    console.error('[archiveFileAction] Error:', err);

    // Human-readable messages for common filesystem error codes
    const code: string = err?.code ?? '';
    if (code === 'EBUSY') {
      return {
        success: false,
        error: 'Item is locked by another process (EBUSY). Close any open files inside this folder and try again.',
      };
    }
    if (code === 'EPERM' || code === 'EACCES') {
      return {
        success: false,
        error: 'Permission denied (EPERM/EACCES). The NAS service may lack write access, or a process holds an exclusive lock on this item.',
      };
    }
    if (code === 'ENOTEMPTY') {
      return {
        success: false,
        error: 'Directory could not be fully removed (ENOTEMPTY). Check for locked files inside the folder.',
      };
    }

    return { success: false, error: err?.message || 'Failed to archive item.' };
  }
}

