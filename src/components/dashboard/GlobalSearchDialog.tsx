'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/auth-context';
import { searchFilesAction } from '@/lib/actions/files-search';
import { FileItem } from '@/lib/types';
import { Search, File, Folder, Film, Image as ImageIcon, Music, Code, FileText, Loader2 } from 'lucide-react';

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectFile?: (file: FileItem) => void;
}

export function GlobalSearchDialog({ open, onOpenChange, onSelectFile }: GlobalSearchDialogProps) {
  const { currentUser } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Close on Escape or shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  // Query real filesystem via searchFilesAction
  useEffect(() => {
    if (!open || !currentUser) return;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const files = await searchFilesAction(currentUser.id, query);
        setResults(files);
      } catch (err) {
        console.error('[GlobalSearch] Error searching files:', err);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [open, query, currentUser?.id]);

  const getFileIcon = (file: FileItem) => {
    if (file.isDirectory) return <Folder className="w-4 h-4 text-primary fill-primary/20" />;
    switch (file.category) {
      case 'video': return <Film className="w-4 h-4 text-indigo-500" />;
      case 'image': return <ImageIcon className="w-4 h-4 text-sky-500" />;
      case 'audio': return <Music className="w-4 h-4 text-emerald-500" />;
      case 'code': return <Code className="w-4 h-4 text-amber-500" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '--';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-background shadow-2xl border-border/60">
        <DialogHeader className="p-4 pb-2 border-b">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-muted-foreground shrink-0" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scoped files, folders, or extensions..."
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0 text-base shadow-none"
              autoFocus
            />
            <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5 font-mono">
              ESC
            </span>
          </div>
        </DialogHeader>

        <div className="p-2 max-h-80 overflow-y-auto space-y-1">
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
            <span>
              {isSearching
                ? 'Searching filesystem...'
                : query.trim() === ''
                ? 'Accessible Home Items'
                : `Found ${results.length} match${results.length === 1 ? '' : 'es'}`}
            </span>
            {isSearching && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>

          {isSearching && results.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span>Scanning physical directory...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No files or folders found within your accessible directories.
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (onSelectFile) onSelectFile(item);
                  onOpenChange(false);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/60 transition-colors text-left group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-md bg-muted group-hover:bg-background transition-colors shrink-0">
                    {getFileIcon(item)}
                  </div>
                  <div className="truncate">
                    <p className="text-sm font-medium leading-none text-foreground truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {item.path}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0 pl-3">
                  {item.isDirectory ? `${item.itemCount || 0} items` : formatBytes(item.sizeBytes)}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <span>Role Scope: <strong className="text-foreground">{currentUser?.role || 'Guest'}</strong></span>
          <span>Access: {currentUser?.role === 'SUPERADMIN' ? 'Root Filesystem' : (currentUser?.homePath || 'Scoped')}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
