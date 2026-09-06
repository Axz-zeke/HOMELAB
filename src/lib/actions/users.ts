'use server';

import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserRole, AuditAction } from '@/lib/types';
import {
  getRawUserRecords,
  saveUserRecords,
  enrichUserRecord,
  getAllUsers,
  getPrimaryStorageRoot,
  UserRecord,
} from '@/lib/users/db';
import { logSystemEvent } from '@/lib/audit/logger';

/**
 * Server Action: Authenticates a user against the database by validating
 * their entered password against the stored bcrypt password_hash.
 */
export async function authenticateUserAction(
  identifier: string,
  plainTextPassword: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    if (!identifier || !plainTextPassword) {
      return { success: false, error: 'Username/email and password are required.' };
    }

    const clean = identifier.trim().toLowerCase();
    const records = await getRawUserRecords();
    const userRecord = records.find(
      (u) => u.username.toLowerCase() === clean || u.email.toLowerCase() === clean
    );

    if (!userRecord) {
      return { success: false, error: 'Invalid username/email or password.' };
    }

    const isValid = await bcrypt.compare(plainTextPassword, userRecord.password_hash);
    if (!isValid) {
      return { success: false, error: 'Invalid username/email or password.' };
    }

    const enrichedUser = await enrichUserRecord(userRecord);

    await logSystemEvent({
      userId: userRecord.id,
      userName: userRecord.name,
      actionType: AuditAction.LOGIN,
      targetPath: userRecord.home_directory_path,
      ipAddress: '127.0.0.1 (Credentials Auth)',
      details: `User ${userRecord.username} successfully authenticated via bcrypt password hash verification.`,
    });

    return { success: true, user: enrichedUser };
  } catch (err: any) {
    console.error('[authenticateUserAction] Auth error:', err);
    return { success: false, error: 'Authentication failed due to server error.' };
  }
}

/**
 * Server Action: Creates a new user with automated physical workspace provisioning:
 * 1. Resolves active Primary Storage pool drive path (e.g., D:\NAS_Storage).
 * 2. Creates physical directory structure on disk: fs.mkdir(targetPath, { recursive: true }) at D:\NAS_Storage\user_homes\{username}.
 * 3. Hashes password securely with bcrypt before saving to database.
 * 4. Saves record in database.
 */
export async function createUserAction(params: {
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  storageQuotaBytes: number | null;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const { name, username, email, password, role, storageQuotaBytes } = params;

    if (!name?.trim()) return { success: false, error: 'Full name is required.' };
    if (!username?.trim()) return { success: false, error: 'Username is required.' };
    if (!email?.trim()) return { success: false, error: 'Email address is required.' };
    if (!password || password.length < 4) {
      return { success: false, error: 'Password is required (minimum 4 characters).' };
    }

    // Sanitize username for safe filesystem directory naming
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!cleanUsername) {
      return { success: false, error: 'Invalid username format.' };
    }

    const records = await getRawUserRecords();

    // Check for duplicate username or email
    const usernameExists = records.some((u) => u.username.toLowerCase() === cleanUsername);
    if (usernameExists) {
      return { success: false, error: `Username '${cleanUsername}' is already in use.` };
    }

    const emailExists = records.some((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (emailExists) {
      return { success: false, error: `Email '${email.trim()}' is already registered.` };
    }

    // 1. Resolve active Primary Storage pool drive path (e.g. D:\NAS_Storage)
    const storageRoot = await getPrimaryStorageRoot();

    // 2. Physical directory path: D:\NAS_Storage\user_homes\{username}
    const targetHomeDirectory = path.join(storageRoot, 'user_homes', cleanUsername);

    // Automatically create physical directory on host disk
    await fs.mkdir(targetHomeDirectory, { recursive: true });

    // Seed friendly starter files in the user's provisioned workspace
    try {
      const readmePath = path.join(targetHomeDirectory, 'Welcome_to_My_Files.txt');
      await fs.writeFile(
        readmePath,
        `Welcome to your Private Homelab NAS Workspace, ${name.trim()}!\n\n` +
        `Physical Storage Path: ${targetHomeDirectory}\n` +
        `Allocated Storage Quota: ${storageQuotaBytes ? `${(storageQuotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB` : 'Unlimited'}\n` +
        `Account Created: ${new Date().toLocaleString()}\n\n` +
        `Your personal uploads are scoped strictly to this directory and isolated from other users.\n`
      );
      await fs.mkdir(path.join(targetHomeDirectory, 'Documents'), { recursive: true });
      await fs.mkdir(path.join(targetHomeDirectory, 'Photos'), { recursive: true });
    } catch (starterErr) {
      console.warn('[createUserAction] Warning writing starter folder:', starterErr);
    }

    // 3. Hash password securely with bcrypt (salt = 10 rounds)
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Create and save account record
    const newRecord: UserRecord = {
      id: `usr_${uuidv4().substring(0, 8)}`,
      username: cleanUsername,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      password_hash: passwordHash,
      role,
      home_directory_path: targetHomeDirectory,
      storage_quota_bytes: storageQuotaBytes,
      used_bytes: 0,
      is_locked: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    records.push(newRecord);
    await saveUserRecords(records);

    await logSystemEvent({
      userId: newRecord.id,
      userName: newRecord.name,
      actionType: AuditAction.USER_CREATED,
      targetPath: targetHomeDirectory,
      ipAddress: '127.0.0.1 (User Management)',
      details: `Created user ${newRecord.username} (${role}) with physical home directory at ${targetHomeDirectory}.`,
    });

    const enriched = await enrichUserRecord(newRecord);
    return { success: true, user: enriched };
  } catch (err: any) {
    console.error('[createUserAction] Failed to create user:', err);
    return { success: false, error: err?.message || 'Failed to create user account.' };
  }
}

/**
 * Server Action: Resets a user's password with secure bcrypt re-hashing.
 */
export async function resetUserPasswordAction(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!newPassword || newPassword.length < 4) {
      return { success: false, error: 'New password must be at least 4 characters.' };
    }

    const records = await getRawUserRecords();
    const index = records.findIndex((u) => u.id === userId);
    if (index === -1) {
      return { success: false, error: 'User record not found.' };
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    records[index].password_hash = passwordHash;
    records[index].updated_at = new Date().toISOString();

    await saveUserRecords(records);

    await logSystemEvent({
      userId: records[index].id,
      userName: records[index].name,
      actionType: AuditAction.PASSWORD_CHANGE,
      targetPath: records[index].home_directory_path,
      ipAddress: '127.0.0.1 (Admin Password Reset)',
      details: `Password was reset for user ${records[index].username}.`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('[resetUserPasswordAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to reset password.' };
  }
}

/**
 * Server Action: Updates a user's storage quota limit.
 */
export async function updateUserQuotaAction(
  userId: string,
  storageQuotaBytes: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const records = await getRawUserRecords();
    const index = records.findIndex((u) => u.id === userId);
    if (index === -1) {
      return { success: false, error: 'User record not found.' };
    }

    records[index].storage_quota_bytes = storageQuotaBytes;
    records[index].updated_at = new Date().toISOString();

    await saveUserRecords(records);

    await logSystemEvent({
      userId: records[index].id,
      userName: records[index].name,
      actionType: AuditAction.USER_UPDATED,
      targetPath: records[index].home_directory_path,
      ipAddress: '127.0.0.1 (Quota Update)',
      details: `Storage quota updated for ${records[index].username} to ${storageQuotaBytes ? `${(storageQuotaBytes / 1e9).toFixed(0)} GB` : 'Unlimited'}.`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('[updateUserQuotaAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to update quota.' };
  }
}

/**
 * Server Action: Deletes a user account. Protects Superadmin and locked accounts.
 */
export async function deleteUserAction(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const records = await getRawUserRecords();
    const target = records.find((u) => u.id === userId);
    if (!target) {
      return { success: false, error: 'User not found.' };
    }

    if (target.role === UserRole.SUPERADMIN || target.is_locked) {
      return {
        success: false,
        error: 'Superadmin accounts are protected by immutable security lock and cannot be deleted.',
      };
    }

    const filtered = records.filter((u) => u.id !== userId);
    await saveUserRecords(filtered);

    await logSystemEvent({
      userId: target.id,
      userName: target.name,
      actionType: AuditAction.USER_DELETED,
      targetPath: target.home_directory_path,
      ipAddress: '127.0.0.1 (User Deletion)',
      details: `User ${target.username} (${target.email}) was deleted from the system.`,
    });

    return { success: true };
  } catch (err: any) {
    console.error('[deleteUserAction] Error:', err);
    return { success: false, error: err?.message || 'Failed to delete user.' };
  }
}

/**
 * Server Action: Fetches all users from database with live disk usage.
 */
export async function getUsersAction(): Promise<User[]> {
  return getAllUsers();
}
