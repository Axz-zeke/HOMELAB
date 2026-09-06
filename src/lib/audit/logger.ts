import { AuditLog, AuditAction } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

const AUDIT_LOG_FILE = path.join(process.cwd(), 'data', 'audit_log.json');
const MAX_LOG_ENTRIES = 2000; // rotate after this many entries

async function ensureLogFile(): Promise<void> {
  try {
    await fs.mkdir(path.dirname(AUDIT_LOG_FILE), { recursive: true });
    await fs.access(AUDIT_LOG_FILE);
  } catch {
    await fs.writeFile(AUDIT_LOG_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

async function readLogs(): Promise<AuditLog[]> {
  try {
    await ensureLogFile();
    const raw = await fs.readFile(AUDIT_LOG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((entry: any) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      }));
    }
  } catch (err) {
    console.warn('[audit] Failed to read log file:', err);
  }
  return [];
}

async function writeLogs(logs: AuditLog[]): Promise<void> {
  try {
    await ensureLogFile();
    // Serialize with ISO strings for JSON compatibility
    const serializable = logs.map((l) => ({
      ...l,
      timestamp: l.timestamp.toISOString(),
    }));
    await fs.writeFile(AUDIT_LOG_FILE, JSON.stringify(serializable, null, 2), 'utf-8');
  } catch (err) {
    console.error('[audit] Failed to write log file:', err);
  }
}

/**
 * Logs a critical system event to the persistent audit database (JSON file on disk).
 * Falls back to console-only on write failure.
 */
export async function logSystemEvent(payload: {
  userId: string;
  userName?: string;
  actionType: AuditAction;
  targetPath?: string;
  ipAddress: string;
  userAgent?: string;
  details?: string;
}) {
  const log: AuditLog = {
    id: uuidv4(),
    timestamp: new Date(),
    ...payload,
  };

  // Console output for immediate server monitoring
  console.log(`[AUDIT - ${log.actionType}] User: ${log.userId} | IP: ${log.ipAddress} | Time: ${log.timestamp.toISOString()}`);
  if (log.targetPath) {
    console.log(`  └─ Target Path: ${log.targetPath}`);
  }

  try {
    const existing = await readLogs();
    const updated = [log, ...existing];

    // Rotate: keep last MAX_LOG_ENTRIES
    const trimmed = updated.slice(0, MAX_LOG_ENTRIES);
    await writeLogs(trimmed);
  } catch (err) {
    console.error('[audit] Could not persist log entry:', err);
  }
}

/**
 * Retrieves all persistent audit logs sorted by newest-first.
 * Restricted to Superadmins in the UI.
 */
export async function getAuditLogs(): Promise<AuditLog[]> {
  const logs = await readLogs();
  return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Clears all audit logs (Superadmin only operation).
 */
export async function clearAuditLogs(): Promise<void> {
  await writeLogs([]);
}
