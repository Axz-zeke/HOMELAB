import fs from 'fs/promises';
import path from 'path';
import bcrypt from 'bcryptjs';
import { User, UserRole } from '@/lib/types';
import { getStoragePoolRegistry } from '@/lib/storage/registry';

const USERS_DB_FILE = path.join(process.cwd(), 'data', 'users.json');

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  home_directory_path: string;
  storage_quota_bytes: number | null; // null for unlimited
  used_bytes?: number;
  is_locked?: boolean;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Recursively calculates the actual byte size of a directory on physical disk.
 */
export async function calculateDirectorySize(dirPath: string): Promise<number> {
  let totalBytes = 0;
  try {
    const dirents = await fs.readdir(dirPath, { withFileTypes: true });
    for (const dirent of dirents) {
      const fullPath = path.join(dirPath, dirent.name);
      try {
        if (dirent.isDirectory()) {
          totalBytes += await calculateDirectorySize(fullPath);
        } else if (dirent.isFile()) {
          const stat = await fs.stat(fullPath);
          totalBytes += stat.size;
        }
      } catch {
        // file unreadable or temporarily locked
      }
    }
  } catch {
    // Directory might not exist yet
  }
  return totalBytes;
}

/**
 * Resolves the primary storage root path from the active storage registry.
 * Fallback to D:\NAS_Storage.
 */
export async function getPrimaryStorageRoot(): Promise<string> {
  try {
    const pools = await getStoragePoolRegistry();
    const primary = pools.find((p) => p.status === 'active' && p.type === 'primary');
    if (primary && primary.targetDirectory) {
      return path.resolve(primary.targetDirectory);
    }
  } catch {
    // fallback
  }
  return path.resolve('D:\\NAS_Storage');
}

/**
 * Ensures the single immutable Superadmin account is seeded on first run
 * with a configurable initial password.
 */
async function ensureSeededSuperadmin(): Promise<UserRecord[]> {
  const initialPassword = process.env.INITIAL_SUPERADMIN_PASSWORD || 'admin123';
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(initialPassword, salt);

  const storageRoot = await getPrimaryStorageRoot();
  const superadminHome = path.join(storageRoot, 'user_homes', 'superadmin');

  try {
    await fs.mkdir(superadminHome, { recursive: true });
  } catch (mkdirErr) {
    console.warn('[users-db] Warning creating superadmin home directory:', mkdirErr);
  }

  const superadmin: UserRecord = {
    id: 'usr_superadmin',
    username: 'superadmin',
    email: 'superadmin@nas.local',
    name: 'Super Admin',
    password_hash: passwordHash,
    role: UserRole.SUPERADMIN,
    home_directory_path: superadminHome,
    storage_quota_bytes: null, // Unlimited
    used_bytes: 0,
    is_locked: true,
    created_at: new Date('2025-01-01').toISOString(),
    updated_at: new Date().toISOString(),
  };

  const users = [superadmin];
  await fs.mkdir(path.dirname(USERS_DB_FILE), { recursive: true });
  await fs.writeFile(USERS_DB_FILE, JSON.stringify(users, null, 2), 'utf-8');
  return users;
}

/**
 * Reads all raw user records from the persistent database file, seeding if empty.
 */
export async function getRawUserRecords(): Promise<UserRecord[]> {
  try {
    await fs.mkdir(path.dirname(USERS_DB_FILE), { recursive: true });
    const content = await fs.readFile(USERS_DB_FILE, 'utf-8');
    const records = JSON.parse(content);
    if (Array.isArray(records) && records.length > 0) {
      return records;
    }
  } catch {
    // File not found or invalid
  }
  return ensureSeededSuperadmin();
}

/**
 * Persists user records back to data/users.json.
 */
export async function saveUserRecords(records: UserRecord[]): Promise<void> {
  await fs.mkdir(path.dirname(USERS_DB_FILE), { recursive: true });
  await fs.writeFile(USERS_DB_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

/**
 * Converts a database UserRecord into the application User interface,
 * calculating live disk usage for their home directory.
 */
export async function enrichUserRecord(record: UserRecord): Promise<User> {
  const liveUsedBytes = await calculateDirectorySize(record.home_directory_path);

  return {
    id: record.id,
    username: record.username,
    email: record.email,
    name: record.name,
    role: record.role,
    password_hash: record.password_hash,
    passwordHash: record.password_hash,
    home_directory_path: record.home_directory_path,
    homePath: `/user_homes/${record.username}`,
    storage_quota_bytes: record.storage_quota_bytes,
    storageQuotaBytes: record.storage_quota_bytes,
    used_bytes: liveUsedBytes,
    usedStorageBytes: liveUsedBytes,
    isLocked: record.is_locked,
    is_locked: record.is_locked,
    avatarUrl: record.avatar_url || '',
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
  };
}

/**
 * Retrieves all users from the database with dynamically calculated live disk usage.
 */
export async function getAllUsers(): Promise<User[]> {
  const records = await getRawUserRecords();
  return Promise.all(records.map(enrichUserRecord));
}

/**
 * Retrieves a single user by their unique ID with live disk usage.
 */
export async function getUserById(id: string): Promise<User | null> {
  const records = await getRawUserRecords();
  const found = records.find((r) => r.id === id);
  if (!found) return null;
  return enrichUserRecord(found);
}

/**
 * Finds a user by either username or email (case-insensitive) and returns their record (including password_hash).
 */
export async function getUserByUsernameOrEmail(identifier: string): Promise<UserRecord | null> {
  const clean = identifier.trim().toLowerCase();
  const records = await getRawUserRecords();
  const found = records.find(
    (r) => r.username.toLowerCase() === clean || r.email.toLowerCase() === clean
  );
  return found || null;
}
