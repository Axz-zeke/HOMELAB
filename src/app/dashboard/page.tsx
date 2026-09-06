'use client';

import { FileBrowser } from '@/components/files/FileBrowser';

export default function DashboardPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Personal Workspace</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Self-hosted personal cloud directory. Accessible over Tailscale or Local LAN offline.
        </p>
      </div>

      {/* Scoped File Browser Engine */}
      <FileBrowser />
    </div>
  );
}
