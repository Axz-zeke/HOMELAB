import fs from 'fs/promises';
import path from 'path';
import { StoragePoolAllocation, StorageType, PoolStatus, AuditAction } from '@/lib/types';
import { logSystemEvent } from '@/lib/audit/logger';

const REGISTRY_FILE = path.join(process.cwd(), 'data', 'storage_registry.json');

const DEFAULT_ALLOCATIONS: StoragePoolAllocation[] = [
  {
    id: 'storage-primary-d',
    name: 'Drive D: (Primary Storage)',
    description: 'Direct Active Upload Target & active user workspaces',
    driveVolumeId: 'vol-D',
    driveLetter: 'D',
    mountPath: 'D:\\',
    targetDirectory: 'D:\\NAS_Storage',
    type: 'primary',
    purpose: 'primary',
    status: 'active',
    priority: 1,
    isSystemDrive: false,
    isPrimary: true,
    isBufferDrive: true,
    createdAt: new Date('2025-01-01').toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'storage-archive-f',
    name: 'Drive F: (Archive)',
    description: 'Cold storage for device backups, camera roll snapshots, and media',
    driveVolumeId: 'vol-F',
    driveLetter: 'F',
    mountPath: 'F:\\',
    targetDirectory: 'F:\\NAS_Archive',
    type: 'archive',
    purpose: 'archive',
    status: 'active',
    priority: 99,
    isSystemDrive: false,
    isPrimary: false,
    isBufferDrive: false,
    createdAt: new Date('2025-01-02').toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'storage-archive-g',
    name: 'Drive G: (Archive)',
    description: 'Secondary archive array for raw media and cold backups',
    driveVolumeId: 'vol-G',
    driveLetter: 'G',
    mountPath: 'G:\\',
    targetDirectory: 'G:\\NAS_Archive',
    type: 'archive',
    purpose: 'archive',
    status: 'active',
    priority: 99,
    isSystemDrive: false,
    isPrimary: false,
    isBufferDrive: false,
    createdAt: new Date('2025-01-05').toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Reads all storage allocations from persistent registry with priority ordering.
 */
export async function getStoragePoolRegistry(): Promise<StoragePoolAllocation[]> {
  try {
    await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
    const content = await fs.readFile(REGISTRY_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .map((item, idx) => ({
          ...item,
          priority: typeof item.priority === 'number' ? item.priority : (item.isPrimary || item.type === 'primary' ? idx + 1 : 99),
          type: item.type || (item.isPrimary || item.purpose === 'user_homes' ? 'primary' : 'archive'),
          purpose: item.purpose === 'user_homes' ? 'primary' : item.purpose === 'temp_uploads' ? 'primary' : item.purpose || 'archive',
        }))
        .sort((a, b) => {
          if (a.type === 'primary' && b.type !== 'primary') return -1;
          if (a.type !== 'primary' && b.type === 'primary') return 1;
          return (a.priority || 99) - (b.priority || 99);
        });
    }
  } catch {
    // initialize defaults
  }

  try {
    await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
    await fs.writeFile(REGISTRY_FILE, JSON.stringify(DEFAULT_ALLOCATIONS, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[registry] Could not persist default registry file:', err);
  }

  return DEFAULT_ALLOCATIONS;
}

/**
 * Persists allocations to registry atomically.
 */
export async function saveStoragePoolRegistry(allocations: StoragePoolAllocation[]): Promise<void> {
  await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true });
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(allocations, null, 2), 'utf-8');
}

/**
 * Dynamic Cascading Upload Path Resolver:
 * Queries assigned Primary Storage pools ordered by priority ASC (Priority 1 = Active Primary, Priority 2 = Secondary Overflow, etc.).
 * Inspects available free space on the drive.
 * Threshold Rule: If a drive has <5% free space or less space than the incoming file,
 * automatically cascades to the next priority drive in sequence.
 */
export async function getActiveUploadDrivePath(incomingBytes: number = 0): Promise<{
  pool: StoragePoolAllocation;
  storageRoot: string;
  isCascaded: boolean;
  cascadeReason?: string;
  priority: number;
}> {
  const pools = await getStoragePoolRegistry();
  const primaryPools = pools
    .filter((p) => p.status === 'active' && p.type === 'primary')
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  if (primaryPools.length === 0) {
    const fallback = pools.find((p) => p.status === 'active' && !p.isSystemDrive);
    if (!fallback) {
      throw new Error('No active Primary Storage drive assigned. Please assign a physical drive in Drive Management.');
    }
    return {
      pool: fallback,
      storageRoot: path.resolve(fallback.targetDirectory),
      isCascaded: false,
      priority: fallback.priority || 1,
    };
  }

  let selectedPool = primaryPools[0];
  let isCascaded = false;
  let cascadeReason: string | undefined;

  for (let i = 0; i < primaryPools.length; i++) {
    const candidate = primaryPools[i];
    try {
      const stats = await fs.statfs(candidate.mountPath);
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bfree;
      const percentFree = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;

      // Threshold: < 5% free space OR less space than incoming file + 10MB safety margin
      const isBelowThreshold = percentFree < 5 || (incomingBytes > 0 && freeBytes < incomingBytes + 10 * 1024 * 1024);

      if (isBelowThreshold) {
        if (i + 1 < primaryPools.length) {
          const nextCandidate = primaryPools[i + 1];
          cascadeReason = `Drive ${candidate.driveLetter}: (Priority ${candidate.priority}) has only ${percentFree.toFixed(1)}% free space (<5% threshold). Cascaded upload to Drive ${nextCandidate.driveLetter}: (Priority ${nextCandidate.priority}).`;
          console.warn(`[storage/cascading] ${cascadeReason}`);
          selectedPool = nextCandidate;
          isCascaded = true;
          continue;
        } else {
          // Last remaining primary pool
          selectedPool = candidate;
          break;
        }
      } else {
        selectedPool = candidate;
        break;
      }
    } catch {
      selectedPool = candidate;
      break;
    }
  }

  await fs.mkdir(selectedPool.targetDirectory, { recursive: true });

  return {
    pool: selectedPool,
    storageRoot: path.resolve(selectedPool.targetDirectory),
    isCascaded,
    cascadeReason,
    priority: selectedPool.priority || 1,
  };
}

/**
 * Returns the currently active Primary Storage drive (resolving cascade if full).
 */
export async function getActivePrimaryPool(incomingBytes: number = 0): Promise<StoragePoolAllocation> {
  const result = await getActiveUploadDrivePath(incomingBytes);
  return result.pool;
}

/**
 * Returns the active buffer directory for multipart chunk uploads.
 * Placed on the designated Primary Storage disk under temp_uploads.
 */
export async function getActiveBufferPool(): Promise<StoragePoolAllocation> {
  const pools = await getStoragePoolRegistry();
  const primary = pools.find((p) => p.status === 'active' && p.type === 'primary' && p.priority === 1) || pools.find((p) => p.type === 'primary');
  if (primary) {
    return {
      ...primary,
      targetDirectory: path.join(primary.mountPath, 'temp_uploads'),
    };
  }
  return DEFAULT_ALLOCATIONS[0];
}

/**
 * Simplified "Add Storage" Handler with Priority Ordering:
 * If "Primary Storage" is selected and a Primary drive already exists,
 * automatically assigns its role as "Secondary (Priority 2)", "Tertiary (Priority 3)", etc.
 */
export async function addStorageDrive(
  driveLetter: string,
  type: StorageType = 'primary',
  customName?: string,
  requestedPriority?: number
): Promise<StoragePoolAllocation> {
  const cleanLetter = driveLetter.replace(/[:\\\/]/g, '').toUpperCase();
  const isSystem = cleanLetter === 'C';

  if (isSystem && type === 'primary') {
    throw new Error('OS partition (C:) is protected and cannot be assigned as Primary Storage.');
  }

  const isPrimary = type === 'primary';
  const targetDirectory = `${cleanLetter}:\\NAS_${isPrimary ? 'Storage' : 'Archive'}`;

  // Ensure target folder exists on physical disk
  await fs.mkdir(targetDirectory, { recursive: true });
  if (isPrimary) {
    await fs.mkdir(`${cleanLetter}:\\temp_uploads`, { recursive: true });
  }

  const pools = await getStoragePoolRegistry();
  const existingPrimaries = pools.filter((p) => p.type === 'primary');

  let priority = 99;
  if (isPrimary) {
    if (typeof requestedPriority === 'number' && requestedPriority > 0) {
      priority = requestedPriority;
    } else if (existingPrimaries.length === 0) {
      priority = 1;
    } else {
      const highest = Math.max(...existingPrimaries.map((p) => p.priority || 1));
      priority = highest + 1;
    }
  }

  const priorityLabel = isPrimary ? (priority === 1 ? 'Primary Storage' : `Overflow Priority ${priority}`) : 'Archive';
  const defaultName = `Drive ${cleanLetter}: (${priorityLabel})`;
  const name = customName?.trim() || defaultName;

  // Check if this drive already has an entry
  const existingIdx = pools.findIndex((p) => p.driveLetter === cleanLetter);
  let newStorage: StoragePoolAllocation;

  if (existingIdx >= 0) {
    newStorage = {
      ...pools[existingIdx],
      name,
      type,
      purpose: type,
      targetDirectory,
      status: 'active',
      priority,
      isPrimary: priority === 1,
      isBufferDrive: isPrimary,
      updatedAt: new Date().toISOString(),
    };
    pools[existingIdx] = newStorage;
  } else {
    newStorage = {
      id: `storage-${cleanLetter.toLowerCase()}-${Date.now()}`,
      name,
      description: isPrimary
        ? `Cascading Primary Storage (Priority ${priority})`
        : 'Cold storage for device backups, camera roll snapshots, and media',
      driveVolumeId: `vol-${cleanLetter}`,
      driveLetter: cleanLetter,
      mountPath: `${cleanLetter}:\\`,
      targetDirectory,
      type,
      purpose: type,
      status: 'active',
      priority,
      isSystemDrive: isSystem,
      isPrimary: priority === 1,
      isBufferDrive: isPrimary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    pools.push(newStorage);
  }

  await saveStoragePoolRegistry(pools);

  await logSystemEvent({
    userId: 'user-superadmin',
    actionType: AuditAction.DRIVE_MOUNTED,
    targetPath: targetDirectory,
    ipAddress: '127.0.0.1 (Drive Management)',
  });

  return newStorage;
}

/**
 * Reorders priority for Primary Storage drives:
 * Swaps priorities between a primary drive and its adjacent neighbor.
 */
export async function reorderStoragePriority(
  poolId: string,
  direction: 'up' | 'down'
): Promise<StoragePoolAllocation[]> {
  const pools = await getStoragePoolRegistry();
  const primaryPools = pools
    .filter((p) => p.type === 'primary')
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  const targetIdx = primaryPools.findIndex((p) => p.id === poolId);
  if (targetIdx === -1) throw new Error('Primary storage pool not found.');

  const swapIdx = direction === 'up' ? targetIdx - 1 : targetIdx + 1;
  if (swapIdx < 0 || swapIdx >= primaryPools.length) {
    return pools; // Cannot move further
  }

  const currentPool = primaryPools[targetIdx];
  const neighborPool = primaryPools[swapIdx];

  const tempPriority = currentPool.priority || 1;
  currentPool.priority = neighborPool.priority || 2;
  neighborPool.priority = tempPriority;

  currentPool.isPrimary = currentPool.priority === 1;
  neighborPool.isPrimary = neighborPool.priority === 1;

  currentPool.name = currentPool.name.replace(/Priority \d+/, `Priority ${currentPool.priority}`);
  neighborPool.name = neighborPool.name.replace(/Priority \d+/, `Priority ${neighborPool.priority}`);

  const updatedPools = pools.map((p) => {
    if (p.id === currentPool.id) return currentPool;
    if (p.id === neighborPool.id) return neighborPool;
    return p;
  });

  await saveStoragePoolRegistry(updatedPools);

  await logSystemEvent({
    userId: 'user-superadmin',
    actionType: AuditAction.DRIVE_MOUNTED,
    targetPath: `Priority Swap: Drive ${currentPool.driveLetter} (P${currentPool.priority}) <-> Drive ${neighborPool.driveLetter} (P${neighborPool.priority})`,
    ipAddress: '127.0.0.1 (Priority Reorder)',
  });

  return updatedPools;
}

/**
 * Simplified "Remove / Unassign Storage" Handler:
 * Unassigns the selected drive from storage pools.
 */
export async function removeStorageDrive(storageId: string): Promise<boolean> {
  const pools = await getStoragePoolRegistry();
  const target = pools.find((p) => p.id === storageId);
  if (!target) throw new Error(`Storage drive allocation '${storageId}' not found.`);

  const filtered = pools.filter((p) => p.id !== storageId);

  // If the removed drive was priority 1 primary, promote the next priority drive
  const remainingPrimaries = filtered
    .filter((p) => p.type === 'primary' && p.status === 'active')
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));

  if (remainingPrimaries.length > 0 && remainingPrimaries[0].priority !== 1) {
    remainingPrimaries[0].priority = 1;
    remainingPrimaries[0].isPrimary = true;
  }

  await saveStoragePoolRegistry(filtered);

  await logSystemEvent({
    userId: 'user-superadmin',
    actionType: AuditAction.DRIVE_DETACHED,
    targetPath: target.targetDirectory,
    ipAddress: '127.0.0.1 (Drive Management)',
  });

  return true;
}

// Backward-compatible aliases
export const mountDriveAsPool = (
  driveLetter: string,
  name: string,
  purpose: any = 'primary',
  customDir?: string
) => {
  const type: StorageType = purpose === 'archive' || purpose === 'backups' || purpose === 'shared_media' ? 'archive' : 'primary';
  return addStorageDrive(driveLetter, type, name);
};

export const unmountDetachPool = async (poolId: string) => {
  await removeStorageDrive(poolId);
  return { id: poolId, status: 'inactive' } as any;
};

export const deletePoolAllocation = (poolId: string) => removeStorageDrive(poolId);

export const setTempUploadBuffer = async (driveLetter: string) => {
  return addStorageDrive(driveLetter, 'primary');
};

export const updatePoolAllocation = async (poolId: string, updates: Partial<StoragePoolAllocation>) => {
  const pools = await getStoragePoolRegistry();
  const idx = pools.findIndex((p) => p.id === poolId);
  if (idx === -1) throw new Error(`Storage pool '${poolId}' not found.`);
  const updated = { ...pools[idx], ...updates, updatedAt: new Date().toISOString() };
  pools[idx] = updated;
  await saveStoragePoolRegistry(pools);
  return updated;
};
