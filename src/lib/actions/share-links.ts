'use server'

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { ShareLink } from '@/lib/types';

// Mock DB for share links in Phase 2
// In Phase 3, this will map to Prisma/Drizzle models
const MOCK_SHARE_LINKS_DB: ShareLink[] = [];

export async function generateShareLink(
  targetPath: string, 
  isFolder: boolean,
  createdByUserId: string,
  options?: {
    password?: string;
    expiresInDays?: number;
    maxDownloads?: number;
    allowPreview?: boolean;
  }
): Promise<{ success: boolean; shareLink?: ShareLink; error?: string }> {
  try {
    const id = uuidv4();
    let passwordHash = undefined;

    // Hash the password securely using bcrypt if provided
    if (options?.password) {
      passwordHash = await bcrypt.hash(options.password, 10);
    }

    let expiresAt = undefined;
    if (options?.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
    }

    const newLink: ShareLink = {
      id,
      targetPath,
      isFolder,
      allowPreview: options?.allowPreview ?? true,
      passwordHash,
      expiresAt,
      maxDownloads: options?.maxDownloads,
      currentDownloads: 0,
      createdByUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to DB
    MOCK_SHARE_LINKS_DB.push(newLink);

    return { success: true, shareLink: newLink };
  } catch (error) {
    console.error('Share generation error:', error);
    return { success: false, error: 'Failed to generate share link' };
  }
}

export async function validateShareLink(shareId: string, password?: string): Promise<{
  success: boolean;
  shareLink?: ShareLink;
  requiresPassword?: boolean;
  error?: string;
}> {
  // In production, fetch from DB
  const link = MOCK_SHARE_LINKS_DB.find((l) => l.id === shareId);
  
  if (!link) {
    return { success: false, error: 'Share link not found' };
  }

  // 1. Check expiration
  if (link.expiresAt && link.expiresAt < new Date()) {
    return { success: false, error: 'Share link has expired' };
  }

  // 2. Check download limits
  if (link.maxDownloads && link.currentDownloads >= link.maxDownloads) {
    return { success: false, error: 'Download limit reached for this share link' };
  }

  // 3. Check password protection
  if (link.passwordHash) {
    if (!password) {
      return { success: false, requiresPassword: true };
    }
    
    const isValid = await bcrypt.compare(password, link.passwordHash);
    if (!isValid) {
      return { success: false, requiresPassword: true, error: 'Invalid password' };
    }
  }

  return { success: true, shareLink: link };
}

// Utility for seeding the mock DB for UI testing
export async function seedMockShareLink(link: ShareLink) {
  MOCK_SHARE_LINKS_DB.push(link);
}
