'use client';

import { FileBrowser } from '@/components/files/FileBrowser';

export default function SharedFilesPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Shared Folders</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Access shared projects and media allocated by administrators.
        </p>
      </div>

      {/* Scoped File Browser for Shared Pools */}
      <FileBrowser initialPath="/shared" scopeToShared={true} />
    </div>
  );
}
