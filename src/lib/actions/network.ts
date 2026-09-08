'use server';

import fs from 'fs/promises';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

export interface NetworkSettings {
  tailscaleIp: string;
  magicDns: string;
  lanPort: string;
  localMdns: string;
}

const DEFAULT_SETTINGS: NetworkSettings = {
  tailscaleIp: '',
  magicDns: '',
  lanPort: '3000',
  localMdns: 'http://mynas.local:3000',
};

/**
 * Reads network/system settings from data/settings.json.
 * Returns defaults with empty strings when the file doesn't exist yet.
 */
export async function getNetworkSettingsAction(): Promise<NetworkSettings> {
  try {
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    const content = await fs.readFile(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return {
      tailscaleIp: parsed.tailscaleIp ?? '',
      magicDns: parsed.magicDns ?? '',
      lanPort: parsed.lanPort ?? '3000',
      localMdns: parsed.localMdns ?? 'http://mynas.local:3000',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persists network/system settings to data/settings.json.
 */
export async function saveNetworkSettingsAction(
  settings: Partial<NetworkSettings>
): Promise<{ success: boolean; error?: string }> {
  try {
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });

    // Merge with existing settings to preserve unknown keys
    let existing: Record<string, unknown> = {};
    try {
      const content = await fs.readFile(SETTINGS_FILE, 'utf-8');
      existing = JSON.parse(content);
    } catch {
      // no existing file – start fresh
    }

    const merged = { ...existing, ...settings, updatedAt: new Date().toISOString() };
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    return { success: true };
  } catch (err: any) {
    console.error('[network-settings] Failed to save:', err);
    return { success: false, error: err?.message ?? 'Failed to save settings.' };
  }
}
