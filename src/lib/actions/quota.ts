'use server';

import { getUserById, getAllUsers, calculateDirectorySize } from '@/lib/users/db';

/**
 * Server-side quota boundary enforcement. Called BEFORE approving any write/upload.
 * Calculates live directory size of user's home directory on disk.
 * If used_bytes + incoming_file_size > storage_quota_bytes, rejects the upload.
 */
export async function checkQuota(
  userId: string,
  uploadSizeBytes: number
): Promise<{
  allowed: boolean;
  error?: string;
  remainingBytes?: number;
  usedBytes?: number;
  quotaBytes?: number | null;
}> {
  try {
    const user = await getUserById(userId);
    if (!user) {
      return { allowed: false, error: 'User account not found.' };
    }

    const quotaBytes = user.storage_quota_bytes ?? user.storageQuotaBytes;

    // Unlimited quota for Superadmin or users configured with null quota
    if (quotaBytes === null || quotaBytes === undefined) {
      return { allowed: true, quotaBytes: null };
    }

    // Dynamic calculation of user's current disk usage directly from physical directory
    const homePath = user.home_directory_path || '';
    const liveUsedBytes = homePath ? await calculateDirectorySize(homePath) : (user.used_bytes || 0);

    const remaining = quotaBytes - liveUsedBytes;

    if (liveUsedBytes + uploadSizeBytes > quotaBytes) {
      const remainingMB = Math.max(0, (remaining / (1024 * 1024))).toFixed(1);
      const quotaMB = (quotaBytes / (1024 * 1024)).toFixed(1);
      return {
        allowed: false,
        remainingBytes: Math.max(0, remaining),
        usedBytes: liveUsedBytes,
        quotaBytes,
        error: `Storage Quota Exceeded. You have ${remainingMB} MB remaining of your ${quotaMB} MB quota.`,
      };
    }

    return {
      allowed: true,
      remainingBytes: remaining - uploadSizeBytes,
      usedBytes: liveUsedBytes,
      quotaBytes,
    };
  } catch (err: any) {
    console.error('[checkQuota] Error calculating quota:', err);
    return { allowed: false, error: 'Failed to verify storage quota.' };
  }
}

/**
 * Returns real storage stats for a specific user, calculated dynamically from physical disk.
 */
export async function getUserStorageStats(userId: string) {
  const user = await getUserById(userId);
  if (!user) return null;

  const quota = user.storage_quota_bytes ?? user.storageQuotaBytes;
  const used = user.used_bytes ?? user.usedStorageBytes ?? 0;

  const percentUsed =
    quota === null || quota === undefined || quota === 0
      ? 0
      : Math.min(100, Math.round((used / quota) * 100));

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    homeDirectoryPath: user.home_directory_path,
    usedBytes: used,
    quotaBytes: quota,
    percentUsed,
    isUnlimited: quota === null,
  };
}

/**
 * Returns all users' live storage stats for the admin analytics view.
 */
export async function getAllUsersStorageStats() {
  const users = await getAllUsers();
  return users.map((user) => {
    const quota = user.storage_quota_bytes ?? user.storageQuotaBytes;
    const used = user.used_bytes ?? user.usedStorageBytes ?? 0;
    const percentUsed =
      quota === null || quota === undefined || quota === 0
        ? 0
        : Math.min(100, Math.round((used / quota) * 100));

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      homeDirectoryPath: user.home_directory_path,
      usedBytes: used,
      quotaBytes: quota,
      percentUsed,
      isUnlimited: quota === null,
    };
  });
}
