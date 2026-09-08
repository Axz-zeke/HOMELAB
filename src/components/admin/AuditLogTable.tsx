'use client';

import { AuditLog, AuditAction } from '@/lib/types';
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Props = { logs: AuditLog[] };

const ACTION_COLORS: Record<AuditAction, string> = {
  [AuditAction.LOGIN]: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  [AuditAction.PASSWORD_CHANGE]: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  [AuditAction.FILE_DELETED]: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  [AuditAction.FILE_UPLOADED]: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  [AuditAction.FILE_DOWNLOADED]: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  [AuditAction.PERMISSION_UPDATE]: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
  [AuditAction.SHARE_LINK_CREATED]: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  [AuditAction.DRIVE_ALLOCATED]: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  [AuditAction.DRIVE_MOUNTED]: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  [AuditAction.DRIVE_DETACHED]: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  [AuditAction.BUFFER_REASSIGNED]: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  [AuditAction.USER_CREATED]: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  [AuditAction.USER_UPDATED]: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  [AuditAction.USER_DELETED]: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  [AuditAction.BACKUP_COMPLETED]: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
};

export function AuditLogTable({ logs }: Props) {
  const [filter, setFilter] = useState<AuditAction | 'ALL'>('ALL');

  const filtered = filter === 'ALL' ? logs : logs.filter((l) => l.actionType === filter);

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {(['ALL', ...Object.values(AuditAction)] as (AuditAction | 'ALL')[]).map((a) => (
          <button
            key={a}
            onClick={() => setFilter(a)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === a
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
            }`}
          >
            {a.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Timestamp</TableHead>
              <TableHead>User / Principal</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>IP / Tailnet Node</TableHead>
              <TableHead>Target Path / Context</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  {logs.length === 0
                    ? 'No audit events logged yet. Events will appear here automatically as users interact with the system.'
                    : 'No audit events recorded for the selected filter.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((log) => (
                <TableRow key={log.id} className="hover:bg-muted/40">
                  <TableCell className="text-xs tabular-nums text-muted-foreground font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {log.userName || log.userId}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        ACTION_COLORS[log.actionType] || 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {log.actionType.replace(/_/g, ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    <div className="flex flex-col">
                      <span>{log.ipAddress}</span>
                      {log.tailnetNode && (
                        <span className="text-[10px] text-muted-foreground">{log.tailnetNode}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground max-w-xs truncate">
                    {log.targetPath ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
