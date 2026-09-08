'use client';

import React, { useState, useMemo } from 'react';
import {
  X, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2,
  FileText, Film, Image as ImageIcon, Music, Code, Archive, HardDrive
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface UploadItem {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number; // 0 - 100
  status: 'queued' | 'uploading' | 'completed' | 'error';
  speed?: string;
  error?: string;
  xhr?: XMLHttpRequest;
  abortController?: AbortController;
}

interface UploadProgressWidgetProps {
  items: UploadItem[];
  isOpen: boolean;
  onClose: () => void;
  onCancelItem?: (id: string) => void;
  onRetryItem?: (id: string) => void;
}

export function UploadProgressWidget({
  items,
  isOpen,
  onClose,
  onCancelItem,
  onRetryItem,
}: UploadProgressWidgetProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  const stats = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.status === 'completed').length;
    const errors = items.filter((i) => i.status === 'error').length;
    const uploading = items.filter((i) => i.status === 'uploading' || i.status === 'queued').length;
    const overallProgress = total > 0
      ? Math.round(items.reduce((acc, item) => acc + item.progress, 0) / total)
      : 0;

    return { total, completed, errors, uploading, overallProgress };
  }, [items]);

  if (!isOpen || items.length === 0) return null;

  const formatBytes = (bytes: number) => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const getIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) {
      return <Film className="w-4 h-4 text-indigo-500 shrink-0" />;
    }
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
      return <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />;
    }
    if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) {
      return <Music className="w-4 h-4 text-emerald-500 shrink-0" />;
    }
    if (['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'rs', 'html', 'css'].includes(ext)) {
      return <Code className="w-4 h-4 text-amber-500 shrink-0" />;
    }
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext)) {
      return <Archive className="w-4 h-4 text-purple-500 shrink-0" />;
    }
    return <FileText className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="fixed bottom-4 inset-x-3 w-auto sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96 z-50 shadow-2xl rounded-2xl border border-border/80 bg-card/95 backdrop-blur-md overflow-hidden transition-all duration-300 animate-in slide-in-from-bottom-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="p-3.5 bg-muted/60 border-b border-border/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            {stats.uploading > 0 ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : stats.errors > 0 ? (
              <AlertCircle className="w-4 h-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-semibold truncate leading-none">
              {stats.uploading > 0
                ? `Uploading ${stats.uploading} item${stats.uploading > 1 ? 's' : ''}...`
                : stats.errors > 0
                ? `${stats.completed} uploaded, ${stats.errors} failed`
                : `${stats.completed} upload${stats.completed > 1 ? 's' : ''} completed`}
            </h4>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
              {stats.uploading > 0 ? `${stats.overallProgress}% overall • Direct Drive Write` : 'All tasks processed'}
            </p>
          </div>
        </div>

        {/* Controls with touch-friendly targets */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setIsMinimized(!isMinimized)}
            className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7 text-muted-foreground hover:text-foreground rounded-lg flex items-center justify-center"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7 text-muted-foreground hover:text-foreground rounded-lg flex items-center justify-center"
            title="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Overall Progress Bar (Always visible) ────────────────────────── */}
      {stats.uploading > 0 && (
        <div className="h-1 w-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${stats.overallProgress}%` }}
          />
        </div>
      )}

      {/* ── File Items List (Collapsible) ────────────────────────────────── */}
      {!isMinimized && (
        <div className="p-3 max-h-72 overflow-y-auto space-y-2.5 divide-y divide-border/30">
          {items.map((item) => (
            <div key={item.id} className="pt-2 first:pt-0 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getIcon(item.name)}
                  <div className="min-w-0 flex-1">
                    <span className="font-medium truncate block leading-tight text-foreground">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatBytes(item.size)}
                      {item.speed && ` • ${item.speed}`}
                    </span>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="shrink-0 flex items-center gap-1.5">
                  {item.status === 'uploading' && (
                    <span className="text-[10px] font-mono text-primary font-semibold">
                      {item.progress}%
                    </span>
                  )}
                  {item.status === 'completed' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                  {item.status === 'error' && (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  )}
                  {item.status === 'queued' && (
                    <span className="text-[10px] text-muted-foreground font-mono">Queued</span>
                  )}
                  {item.status === 'uploading' && onCancelItem && (
                    <button
                      onClick={() => onCancelItem(item.id)}
                      className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                      title="Cancel file upload"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {item.status === 'error' && onRetryItem && (
                    <button
                      onClick={() => onRetryItem(item.id)}
                      className="text-[10px] text-primary hover:underline font-mono"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>

              {/* Individual Item Progress Bar */}
              {item.status === 'uploading' && (
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-150 rounded-full"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}

              {/* Error Message if failed */}
              {item.status === 'error' && item.error && (
                <p className="text-[10px] text-destructive leading-tight bg-destructive/10 p-1.5 rounded-md border border-destructive/20">
                  {item.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      {!isMinimized && (
        <div className="p-2.5 px-3.5 bg-muted/40 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <HardDrive className="w-3 h-3" />
            Parallel Streaming
          </span>
          <span className="font-mono">
            {stats.completed}/{stats.total} done
          </span>
        </div>
      )}
    </div>
  );
}
