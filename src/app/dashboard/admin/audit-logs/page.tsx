import { getAuditLogs, logSystemEvent } from '@/lib/audit/logger';
import { AuditAction } from '@/lib/types';
import { AuditLogTable } from '@/components/admin/AuditLogTable';
import { ShieldAlert } from 'lucide-react';

// Seed initial demo events only when no logs exist yet (first-run experience)
async function seedIfEmpty() {
  const existing = await getAuditLogs();
  if (existing.length > 0) return; // already has entries, skip seeding

  const mockEvents = [
    { userId: 'user-1', actionType: AuditAction.LOGIN, ipAddress: '100.64.0.1' },
    { userId: 'user-2', actionType: AuditAction.FILE_DELETED, targetPath: '/home/user-2/videos/old.mp4', ipAddress: '192.168.1.100' },
    { userId: 'user-1', actionType: AuditAction.SHARE_LINK_CREATED, targetPath: '/home/user-1/docs/report.pdf', ipAddress: '100.64.0.1' },
    { userId: 'user-2', actionType: AuditAction.PASSWORD_CHANGE, ipAddress: '192.168.1.100' },
    { userId: 'user-1', actionType: AuditAction.DRIVE_ALLOCATED, targetPath: 'D:/', ipAddress: '100.64.0.1' },
    { userId: 'user-1', actionType: AuditAction.PERMISSION_UPDATE, targetPath: '/shared/projects/', ipAddress: '100.64.0.1' },
    { userId: 'user-superadmin', actionType: AuditAction.DRIVE_MOUNTED, targetPath: 'D:\\NAS_Storage', ipAddress: '127.0.0.1 (Drive Management)' },
  ];
  for (const e of mockEvents) await logSystemEvent(e);
}

export default async function AuditLogsPage() {
  await seedIfEmpty();
  const logs = await getAuditLogs();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-7 h-7 text-primary" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Audit Log</h2>
          <p className="text-muted-foreground text-sm">
            Security activity monitor — all critical system events.{' '}
            <span className="font-mono text-xs text-muted-foreground">
              {logs.length} record{logs.length === 1 ? '' : 's'} persisted on disk.
            </span>
          </p>
        </div>
      </div>
      <AuditLogTable logs={logs} />
    </div>
  );
}
