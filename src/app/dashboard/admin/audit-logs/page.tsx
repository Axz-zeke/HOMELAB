import { getAuditLogs } from '@/lib/audit/logger';
import { AuditLogTable } from '@/components/admin/AuditLogTable';
import { ShieldAlert } from 'lucide-react';

export default async function AuditLogsPage() {
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
