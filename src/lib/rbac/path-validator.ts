import { User, UserRole, FolderPermission } from '@/lib/types';

/**
 * Validates whether a user has access to a requested logical or physical path.
 * Enforces strict RBAC boundary checks for Superadmin, Admin, and User roles.
 * 
 * @param user The user requesting access
 * @param requestedPath The path being requested (e.g., '/', '/Documents', '/shared/projects')
 * @param requiredAccess The type of access required ('read' | 'write' | 'read-write')
 * @param permissions Explicit folder permissions assigned to the user (e.g., scoped_folder_assignments)
 */
export function validatePathAccess(
  user: User,
  requestedPath: string,
  requiredAccess: 'read' | 'write' | 'read-write' = 'read',
  permissions: FolderPermission[] = []
): { allowed: boolean; reason?: string } {
  if (!user) {
    return { allowed: false, reason: 'Unauthenticated user session.' };
  }

  // Normalize path and prevent directory traversal
  const cleanPath = (requestedPath || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim();
  
  if (cleanPath.includes('..')) {
    return { allowed: false, reason: 'Traversal attack detected (path contains "..")' };
  }

  // 1. SUPERADMIN: Unrestricted system-wide access
  if (user.role === UserRole.SUPERADMIN) {
    return { allowed: true };
  }

  // 2. ADMIN: Full access to shared directories, drive pools, and user paths EXCEPT Superadmin's private data
  if (user.role === UserRole.ADMIN) {
    if (cleanPath.toLowerCase().includes('superadmin')) {
      return { allowed: false, reason: 'Admins cannot access Superadmin private folders.' };
    }
    return { allowed: true };
  }

  // 3. USER: Strictly scoped to personal home workspace & explicit ACL folder assignments
  // Root display path "/" or empty path is ALWAYS allowed for standard user home workspace
  if (!cleanPath || cleanPath === '/' || cleanPath === '' || cleanPath === '/dashboard') {
    return { allowed: true };
  }

  const username = (user.username || user.name || user.id).toLowerCase();
  const userId = (user.id || '').toLowerCase();

  const normalizedHome = user.home_directory_path
    ? user.home_directory_path.replace(/\\/g, '/').replace(/\/+/g, '/').trim().toLowerCase()
    : `/user_homes/${username}`;

  // Specific home directory prefixes for this user
  const allowedHomePrefixes = [
    `/user_homes/${username}`,
    `/user_homes/${userId}`,
    `/home/${username}`,
    `/home/${userId}`,
    normalizedHome,
  ].filter(Boolean);

  const cleanLower = cleanPath.toLowerCase();

  // Check explicit user home directory match
  for (const prefix of allowedHomePrefixes) {
    if (cleanLower === prefix || cleanLower.startsWith(`${prefix}/`)) {
      return { allowed: true };
    }
  }

  // Block attempts to access another user's home directory (e.g. /user_homes/superadmin or /home/superadmin)
  if (cleanLower.startsWith('/user_homes/') || cleanLower.startsWith('/home/')) {
    return {
      allowed: false,
      reason: `Access Denied: You cannot browse outside your assigned home workspace.`,
    };
  }

  // Shared root view for "Shared with Me"
  if (cleanLower === '/shared' || cleanLower === '/shared/') {
    return { allowed: true };
  }

  // Explicit folder permissions (e.g. /shared/projects)
  for (const perm of permissions) {
    const permPath = (perm.path || '').replace(/\\/g, '/').replace(/\/+/g, '/').trim().toLowerCase();
    if (cleanLower === permPath || cleanLower.startsWith(`${permPath}/`)) {
      if (requiredAccess === 'read') return { allowed: true };
      if (requiredAccess === 'write' && (perm.accessType === 'write' || perm.accessType === 'read-write')) return { allowed: true };
      if (requiredAccess === 'read-write' && perm.accessType === 'read-write') return { allowed: true };
      return { 
        allowed: false, 
        reason: `Insufficient permission level: requires ${requiredAccess}, granted ${perm.accessType}` 
      };
    }
  }

  // Relative subpaths inside home view (e.g. /Documents, /Photos, /Welcome_to_My_Files.txt)
  if (cleanPath.startsWith('/') && !cleanLower.startsWith('/shared')) {
    return { allowed: true };
  }

  // Blocked by default
  return { 
    allowed: false, 
    reason: `Access Denied: Path "${cleanPath}" is outside your personal home directory and assigned permissions.` 
  };
}

/**
 * Filter an array of files/folders based on a user's RBAC scope.
 */
export function filterAccessibleItems<T extends { path: string }>(
  items: T[],
  user: User,
  permissions: FolderPermission[] = []
): T[] {
  return items.filter((item) => {
    const { allowed } = validatePathAccess(user, item.path, 'read', permissions);
    return allowed;
  });
}
