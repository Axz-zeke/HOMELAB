'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  HardDrive,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  X,
  ArrowRight,
  Database,
  ServerCrash,
  FileWarning,
} from 'lucide-react';

export type UploadErrorType = 'storage_full' | 'network_error' | 'server_error' | null;

export interface UploadErrorInfo {
  type: UploadErrorType;
  title?: string;
  message?: string;
  requiredBytes?: number;
  remainingBytes?: number;
  quotaBytes?: number | null;
  usedBytes?: number;
  fileName?: string;
  currentChunk?: number;
  totalChunks?: number;
  serverDetails?: string;
  onRetry?: () => void | Promise<void>;
  onManageStorage?: () => void;
}

export interface UploadErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorInfo: UploadErrorInfo | null;
  onRetry?: () => void | Promise<void>;
  onManageStorage?: () => void;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  if (bytes === Infinity) return 'Unlimited';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function UploadErrorDialog({
  open,
  onOpenChange,
  errorInfo,
  onRetry,
  onManageStorage,
}: UploadErrorDialogProps) {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);

  if (!errorInfo) return null;

  const {
    type,
    title,
    message,
    requiredBytes,
    remainingBytes,
    quotaBytes,
    usedBytes,
    fileName,
    currentChunk,
    totalChunks,
    serverDetails,
  } = errorInfo;

  const handleManageStorage = () => {
    onOpenChange(false);
    if (onManageStorage) {
      onManageStorage();
    } else if (errorInfo.onManageStorage) {
      errorInfo.onManageStorage();
    } else {
      router.push('/dashboard/admin/drives');
    }
  };

  const handleRetry = async () => {
    const retryFn = onRetry || errorInfo.onRetry;
    if (!retryFn) return;
    try {
      setIsRetrying(true);
      await retryFn();
      onOpenChange(false);
    } catch (err) {
      console.error('[UploadErrorDialog] Retry failed:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  // 1. Storage Limit Exceeded ("Storage Full")
  if (type === 'storage_full') {
    const defaultMsg =
      requiredBytes !== undefined && remainingBytes !== undefined
        ? `This file requires ${formatBytes(requiredBytes)}, but you only have ${formatBytes(remainingBytes)} available.`
        : message || 'Your user storage quota has been reached.';

    const quotaTotal = quotaBytes || 1;
    const currentUsed = usedBytes || 0;
    const percentUsed = Math.min(100, Math.round((currentUsed / quotaTotal) * 100));

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90vw] max-w-sm rounded-2xl p-0 overflow-hidden border-amber-500/30 shadow-2xl bg-card">
          <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  {title || 'Storage Space Exceeded'}
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-muted-foreground">
                  Upload blocked by user storage quota boundary.
                </DialogDescription>
              </div>
            </div>

            {/* Error Message */}
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-300 font-medium leading-relaxed">
              {defaultMsg}
            </div>

            {/* Breakdown Visualizer */}
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border/60 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-primary" />
                  Storage Allocation
                </span>
                <span className="font-mono font-medium text-foreground">
                  {formatBytes(currentUsed)} / {formatBytes(quotaBytes ?? undefined)}
                </span>
              </div>

              <div className="w-full bg-muted rounded-full h-2 overflow-hidden flex">
                <div
                  className="bg-amber-500 h-full rounded-full transition-all"
                  style={{ width: `${percentUsed}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div className="bg-background/80 p-2 rounded-lg border">
                  <span className="text-muted-foreground block text-[10px]">Required for file</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatBytes(requiredBytes)}
                  </span>
                </div>
                <div className="bg-background/80 p-2 rounded-lg border">
                  <span className="text-muted-foreground block text-[10px]">Remaining space</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {formatBytes(remainingBytes)}
                  </span>
                </div>
              </div>

              {fileName && (
                <p className="text-[11px] text-muted-foreground truncate pt-1 border-t border-border/40 font-mono">
                  File: <span className="text-foreground">{fileName}</span>
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="p-4 bg-muted/20 border-t border-border/60 flex flex-row items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Dismiss
            </Button>
            <Button
              size="sm"
              onClick={handleManageStorage}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
            >
              Manage Storage
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // 2. Internet / Network Disconnection ("Upload Interrupted")
  if (type === 'network_error') {
    const defaultMsg =
      message ||
      'Network connection lost during upload. Please check your internet connection and try again.';

    const hasChunkProgress =
      currentChunk !== undefined && totalChunks !== undefined && totalChunks > 0;
    const chunkPercent = hasChunkProgress
      ? Math.round((currentChunk / totalChunks) * 100)
      : 0;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[90vw] max-w-sm rounded-2xl p-0 overflow-hidden border-rose-500/30 shadow-2xl bg-card">
          <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shrink-0">
                <WifiOff className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="space-y-0.5 sm:space-y-1">
                <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  {title || 'Upload Interrupted'}
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-muted-foreground">
                  Connection timed out or network interface disconnected.
                </DialogDescription>
              </div>
            </div>

            {/* Error Message */}
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-800 dark:text-rose-300 font-medium leading-relaxed">
              {defaultMsg}
            </div>

            {/* Resumable Transfer Info Callout */}
            <div className="p-3.5 bg-muted/40 rounded-xl border border-border/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-primary" />
                  Resumable Progress Safeguard
                </span>
                {hasChunkProgress && (
                  <span className="font-mono text-primary font-bold">{chunkPercent}%</span>
                )}
              </div>

              {hasChunkProgress ? (
                <div className="space-y-1.5">
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${chunkPercent}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Received <strong className="text-foreground font-mono">{currentChunk}</strong>{' '}
                    of <strong className="text-foreground font-mono">{totalChunks}</strong> chunks
                    on disk buffer. Retrying will resume exactly where it left off without
                    restarting from 0%.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Clicking "Retry Upload" will safely reconnect and resume your transfer.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="p-4 bg-muted/20 border-t border-border/60 flex flex-row items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isRetrying}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRetry}
              disabled={isRetrying}
              className="gap-1.5 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Resuming Transfer...' : 'Retry Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // 3. Disk / Server Error ("Upload Failed")
  const defaultMsg =
    message || 'Server encountered an issue writing chunks to physical storage.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-sm rounded-2xl p-0 overflow-hidden border-destructive/30 shadow-2xl bg-card">
        <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center shrink-0">
              <ServerCrash className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <DialogTitle className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                {title || 'Upload Failed'}
              </DialogTitle>
              <DialogDescription className="text-[11px] sm:text-xs text-muted-foreground">
                Target physical drive or filesystem write error.
              </DialogDescription>
            </div>
          </div>

          {/* Fault Message */}
          <div className="p-3.5 bg-destructive/10 border border-destructive/20 rounded-xl text-xs text-destructive font-medium leading-relaxed">
            {defaultMsg}
          </div>

          {serverDetails && (
            <div className="p-3 bg-muted/50 rounded-xl border border-border/60 text-[11px] font-mono text-muted-foreground break-all">
              <span className="font-bold text-foreground block mb-0.5">Diagnostic Details:</span>
              {serverDetails}
            </div>
          )}

          <div className="p-3 bg-muted/30 rounded-xl border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
            <FileWarning className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <span>
              If this error persists, verify that the physical storage drive is mounted and write
              permissions are enabled in Drive Management.
            </span>
          </div>
        </div>

        <DialogFooter className="p-4 bg-muted/20 border-t border-border/60 flex flex-row items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Dismiss
          </Button>
          {(onRetry || errorInfo.onRetry) && (
            <Button size="sm" onClick={handleRetry} disabled={isRetrying} className="gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Retry Upload'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
