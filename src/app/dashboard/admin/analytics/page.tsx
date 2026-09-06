import { getAllUsersStorageStats } from '@/lib/actions/quota';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StorageBreakdownChart } from '@/components/analytics/StorageBreakdownChart';
import { UserQuotaChart } from '@/components/analytics/UserQuotaChart';
import { BarChart3, PieChart, Users, HardDrive } from 'lucide-react';

function formatBytes(bytes: number) {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default async function AnalyticsPage() {
  const stats = (await getAllUsersStorageStats()).filter(Boolean) as Awaited<ReturnType<typeof getAllUsersStorageStats>>[number][];

  const quotaStats = stats.map((s) => ({
    name: s!.name,
    usedGB: s!.usedBytes / 1_073_741_824,
    quotaGB: s!.quotaBytes ? s!.quotaBytes / 1_073_741_824 : null,
    percentUsed: s!.percentUsed,
  }));

  const totalUsed = stats.reduce((acc, s) => acc + (s?.usedBytes ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Storage Analytics</h2>
        <p className="text-muted-foreground">System-wide storage usage and per-user quota tracking.</p>
      </div>

      {/* KPI strip */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Used (All Users)</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(totalUsed)}</div>
            <p className="text-xs text-muted-foreground mt-1">Across all drives</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Managed Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Active accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Near Limit (&gt;80%)</CardTitle>
            <BarChart3 className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {stats.filter((s) => s && s.percentUsed >= 80 && !s.isUnlimited).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Quota warnings</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-primary" />
              Storage by File Type
            </CardTitle>
            <CardDescription>Breakdown across all drives and users.</CardDescription>
          </CardHeader>
          <CardContent>
            <StorageBreakdownChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Per-User Quota Usage
            </CardTitle>
            <CardDescription>Used vs. allocated quota per account.</CardDescription>
          </CardHeader>
          <CardContent>
            <UserQuotaChart stats={quotaStats} />
          </CardContent>
        </Card>
      </div>

      {/* Per-user quota table */}
      <Card>
        <CardHeader>
          <CardTitle>Quota Summary</CardTitle>
          <CardDescription>Detailed storage allocation per user account.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.map((s) => {
              if (!s) return null;
              const pct = s.percentUsed;
              const barColor = pct >= 90 ? 'bg-destructive' : pct >= 70 ? 'bg-amber-500' : 'bg-primary';
              return (
                <div key={s.userId} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {formatBytes(s.usedBytes)} / {s.isUnlimited ? '∞ Unlimited' : formatBytes(s.quotaBytes!)}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    {!s.isUnlimited && (
                      <div
                        className={`h-2 rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    )}
                  </div>
                  {!s.isUnlimited && (
                    <p className="text-xs text-muted-foreground">{pct}% used</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
