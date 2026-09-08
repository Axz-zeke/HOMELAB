'use server';

import { getUserById, getAllUsers, calculateDirectorySize } from '@/lib/users/db';

function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Server-side quota boundary enforcement. Called BEFORE approving any write/upload.
 * Supports unlimited file sizes up to the user's available quota boundary.
 * Calculates live directory size of user's home directory on disk.
 * If liveUsedBytes + incoming_file_size > storage_quota_bytes, rejects the upload.
 */
export async function checkQuota(
  userId: string,
  uploadSizeBytes: number
): Promise<{
  allowed: boolean;
  error?: string;
  formattedMessage?: string;
  remainingBytes?: number;
  usedBytes?: number;
  quotaBytes?: number | null;
  requiredBytes?: number;
}> {
  try {
    const user = await getUserById(userId);
    if (!user) {
      return { allowed: false, error: 'User account not found.', requiredBytes: uploadSizeBytes };
    }

    const quotaBytes = user.storage_quota_bytes ?? user.storageQuotaBytes;

    // Unlimited quota for Superadmin or users configured with null quota
    if (quotaBytes === null || quotaBytes === undefined) {
      return {
        allowed: true,
        quotaBytes: null,
        requiredBytes: uploadSizeBytes,
        remainingBytes: Infinity,
      };
    }

    // Dynamic calculation of user's current disk usage directly from physical directory
    const homePath = user.home_directory_path || '';
    const liveUsedBytes = homePath ? await calculateDirectorySize(homePath) : (user.used_bytes || 0);

    const remaining = Math.max(0, quotaBytes - liveUsedBytes);

    if (liveUsedBytes + uploadSizeBytes > quotaBytes) {
      const reqStr = formatStorageBytes(uploadSizeBytes);
      const availStr = formatStorageBytes(remaining);
      const formattedMessage = `This file requires ${reqStr}, but you only have ${availStr} available.`;

      return {
        allowed: false,
        remainingBytes: remaining,
        usedBytes: liveUsedBytes,
        quotaBytes,
        requiredBytes: uploadSizeBytes,
        formattedMessage,
        error: `Storage Space Exceeded. ${formattedMessage}`,
      };
    }

    return {
      allowed: true,
      remainingBytes: remaining - uploadSizeBytes,
      usedBytes: liveUsedBytes,
      quotaBytes,
      requiredBytes: uploadSizeBytes,
    };
  } catch (err: any) {
    console.error('[checkQuota] Error calculating quota:', err);
    return {
      allowed: false,
      error: 'Failed to verify storage quota.',
      requiredBytes: uploadSizeBytes,
    };
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
