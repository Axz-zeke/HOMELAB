export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash?: string;
  passwordHash?: string;
  home_directory_path?: string; // Physical path, e.g. D:\NAS_Storage\user_homes\user1
  homePath?: string; // Logical path e.g. /home/user1
  storage_quota_bytes?: number | null; // null for Unlimited, or bytes
  storageQuotaBytes: number | null;
  used_bytes: number; // Calculated dynamically from physical home directory
  usedStorageBytes: number;
  homeDriveId?: string;
  isLocked?: boolean; // Superadmin protection lock
  is_locked?: boolean;
  avatarUrl?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export type DriveHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'UNKNOWN' | 'VIRTUAL';

export interface SmartHealthInfo {
  operationalStatus?: string;
  healthStatus?: string;
  predictFailure?: boolean | null;
  healthPercentage?: number;
  friendlyName?: string;
  mediaType?: string;
  busType?: string;
  isVirtualOrUnmapped?: boolean;
}

export type StorageType = 'primary' | 'archive';
export type PoolPurpose = 'primary' | 'archive' | 'user_homes' | 'temp_uploads' | 'shared_media' | 'backups' | 'general';
export type PoolStatus = 'active' | 'inactive';

export interface StoragePoolAllocation {
  id: string;
  name: string; // e.g. "Drive D: (Primary Storage)"
  description?: string;
  driveVolumeId: string; // e.g. "vol-D", "vol-G"
  driveLetter: string; // e.g. "D", "G"
  mountPath: string; // e.g. "D:\" or "G:\"
  targetDirectory: string; // e.g. "D:\NAS_Storage" or "G:\NAS_Archive"
  type: StorageType; // 'primary' | 'archive'
  purpose: PoolPurpose; // 'primary' | 'archive' (with legacy values supported)
  status: PoolStatus; // 'active' | 'inactive'
  isSystemDrive: boolean; // true if C: or root
  isBufferDrive?: boolean; // true if temp upload buffer
  isPrimary?: boolean; // true if designated as Primary Storage for user uploads
  priority: number; // 1 = Active Primary, 2 = Secondary Overflow, 3 = Tertiary Overflow
  totalSpaceBytes?: number;
  usedSpaceBytes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DriveVolume {
  id: string;
  name: string; // e.g., "Mass Storage Array", "Backup Archive"
  volumeName?: string; // Actual volume label e.g., "MAIN NVMe", "HDD 1", "DATA_ARRAY"
  deviceType?: string; // e.g., "NVMe", "SSD", "HDD", "USB"
  path: string; // e.g., 'D:/', 'F:/', '/mnt/disk1'
  mountPoint?: string;
  formatType: string; // e.g., 'NTFS', 'ext4', 'exFAT', 'ZFS'
  totalSpaceBytes: number;
  usedSpaceBytes: number;
  isOnline: boolean;
  isSystemDrive?: boolean; // Protect C:/ or / from being used for uploads
  temperatureCelsius?: number; // e.g. 34
  healthStatus?: DriveHealthStatus;
  smartHealth?: SmartHealthInfo;
  readSpeedMBps?: number;
  writeSpeedMBps?: number;
  activePools?: StoragePoolAllocation[];
  isMounted?: boolean;
  isBuffer?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoragePool {
  id: string;
  name: string;
  description?: string;
  driveVolumeId: string;
  targetPath: string; // Target path on disk, e.g. D:/user_homes or D:/shared_media
  isSystemShare: boolean; // True if it's a root storage pool for all shared files
  allocatedBytes?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FolderPermission {
  id: string;
  userId: string;
  driveVolumeId: string;
  path: string; // The explicit folder path within the drive
  accessType: 'read' | 'write' | 'read-write';
  createdAt: Date;
  updatedAt: Date;
}

export interface ShareLink {
  id: string; // standard UUID v4
  targetPath: string; // Absolute path to the shared file or folder
  token?: string; // Optional token if using a different format than ID
  isFolder: boolean; // True if sharing a whole directory
  allowPreview: boolean; // True if external users can preview without downloading
  
  // Security
  passwordHash?: string; // bcrypt hash if protected
  expiresAt?: Date; // Expiration date
  maxDownloads?: number; // E.g., max 5 downloads
  currentDownloads: number;
  
  createdByUserId: string; // The user who generated the link
  createdAt: Date;
  updatedAt: Date;
}

export enum AuditAction {
  LOGIN = 'LOGIN',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  FILE_DELETED = 'FILE_DELETED',
  FILE_UPLOADED = 'FILE_UPLOADED',
  FILE_DOWNLOADED = 'FILE_DOWNLOADED',
  PERMISSION_UPDATE = 'PERMISSION_UPDATE',
  SHARE_LINK_CREATED = 'SHARE_LINK_CREATED',
  DRIVE_ALLOCATED = 'DRIVE_ALLOCATED',
  DRIVE_MOUNTED = 'DRIVE_MOUNTED',
  DRIVE_DETACHED = 'DRIVE_DETACHED',
  BUFFER_REASSIGNED = 'BUFFER_REASSIGNED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  BACKUP_COMPLETED = 'BACKUP_COMPLETED',
}

export interface AuditLog {
  id: string;
  timestamp: Date;
  userId: string;
  userName?: string;
  actionType: AuditAction;
  targetPath?: string; // Optional context, e.g., which file was touched
  ipAddress: string;
  tailnetNode?: string; // e.g. "laptop-node.tailnet" or "local-lan"
  userAgent?: string;
  details?: string;
}

export type FileCategory = 'video' | 'image' | 'audio' | 'document' | 'code' | 'archive' | 'other';

export interface FileItem {
  id: string;
  name: string;
  path: string; // Logical path e.g. /home/user-1/Photos/vacation.jpg
  isDirectory: boolean;
  sizeBytes: number;
  mimeType?: string;
  extension?: string;
  category: FileCategory;
  modifiedAt: Date;
  driveVolumeId?: string;
  physicalMountPath?: string; // Exact physical drive mount path where file was saved (e.g. D:\NAS_Storage)
  physicalDiskLetter?: string; // e.g. "D" or "F"
  isFavorite?: boolean;
  itemCount?: number; // if directory
  hash?: string; // SHA-256 for camera roll deduplication
}

export interface UploadChunkState {
  index: number;
  startByte: number;
  endByte: number;
  uploaded: boolean;
}

export interface UploadSession {
  uploadId: string;
  fileName: string;
  fileSizeBytes: number;
  chunkSizeBytes: number;
  totalChunks: number;
  uploadedChunks: number[];
  destinationPath: string;
  status: 'idle' | 'uploading' | 'paused' | 'completed' | 'error';
  progressPercent: number;
  errorMessage?: string;
  startedAt: number;
}

export interface NetworkEnvironment {
  isTailscaleActive: boolean;
  tailscaleIp: string;
  magicDns: string;
  lanIp: string;
  localMdns: string;
  isInternetAvailable: boolean;
  transferSpeedMBps: number;
}
