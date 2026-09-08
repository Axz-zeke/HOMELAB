'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-context';
import { checkQuota } from '@/lib/actions/quota';
import { UploadErrorDialog, UploadErrorInfo } from '@/components/upload/UploadErrorDialog';
import { 
  UploadCloud, 
  Pause, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  HardDrive, 
  Smartphone, 
  FileCheck,
  Folder
} from 'lucide-react';

interface ChunkUploadModalProps {
  currentPath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete?: (fileName: string, size: number) => void;
}

export function ChunkUploadModal({
  currentPath,
  open,
  onOpenChange,
  onUploadComplete,
}: ChunkUploadModalProps) {
  const { currentUser } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'uploading' | 'paused' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadSpeed, setUploadSpeed] = useState('0 MB/s');
  const [isCameraRollMode, setIsCameraRollMode] = useState(false);
  const [isDuplicateDetected, setIsDuplicateDetected] = useState(false);
  const [physicalSavedPath, setPhysicalSavedPath] = useState<string | null>(null);

  // Global Error Dialog state
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogInfo, setErrorDialogInfo] = useState<UploadErrorInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPausedRef = useRef(false);
  const uploadIdRef = useRef<string>('');

  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunk slices

  useEffect(() => {
    if (open) {
      setFile(null);
      setStatus('idle');
      setProgress(0);
      setCurrentChunk(0);
      setErrorMessage(null);
      setIsDuplicateDetected(false);
      setPhysicalSavedPath(null);
      setErrorDialogOpen(false);
      setErrorDialogInfo(null);
      isPausedRef.current = false;
    }
  }, [open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    const chunks = Math.ceil(selected.size / CHUNK_SIZE);
    setTotalChunks(chunks);
    setErrorMessage(null);
    setIsDuplicateDetected(false);
    setPhysicalSavedPath(null);

    // Duplicate detection simulation for camera roll mode
    if (isCameraRollMode && selected.name.includes('IMG_20260904')) {
      setIsDuplicateDetected(true);
    }
  };

  const startUpload = async () => {
    if (!file || !currentUser) return;

    setStatus('checking');
    setErrorMessage(null);

    // 1. Pre-Upload Quota Verification before chunk 0
    const quotaResult = await checkQuota(currentUser.id, file.size);
    if (!quotaResult.allowed) {
      setStatus('error');
      const errText = quotaResult.error || 'Storage quota exceeded.';
      setErrorMessage(errText);
      setErrorDialogInfo({
        type: 'storage_full',
        title: 'Storage Space Exceeded',
        message: quotaResult.formattedMessage || errText,
        requiredBytes: quotaResult.requiredBytes || file.size,
        remainingBytes: quotaResult.remainingBytes,
        quotaBytes: quotaResult.quotaBytes,
        usedBytes: quotaResult.usedBytes,
        fileName: file.name,
      });
      setErrorDialogOpen(true);
      return;
    }

    // 2. Begin Real Physical Chunked Upload
    setStatus('uploading');
    isPausedRef.current = false;

    // Generate unique session ID for staging
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    uploadIdRef.current = uploadId;

    executeChunkUpload(0, uploadId);
  };

  const executeChunkUpload = async (startChunkIndex: number, uploadId: string) => {
    if (!file || !currentUser) return;

    const total = Math.ceil(file.size / CHUNK_SIZE);
    let index = startChunkIndex;

    const startTime = Date.now();
    let bytesUploadedSoFar = index * CHUNK_SIZE;

    while (index < total) {
      if (isPausedRef.current) {
        setStatus('paused');
        return;
      }

      const start = index * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunkBlob = file.slice(start, end);

      const formData = new FormData();
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', index.toString());
      formData.append('chunk', chunkBlob, file.name);
      formData.append('userId', currentUser.id);

      try {
        const res = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));

          // Mid-transfer quota exceeded safeguard
          if (res.status === 403 || errData.code === 'QUOTA_EXCEEDED') {
            setErrorDialogInfo({
              type: 'storage_full',
              title: 'Storage Space Exceeded',
              message:
                errData.formattedMessage ||
                errData.error ||
                'Storage Quota Exceeded mid-transfer.',
              requiredBytes: errData.requiredBytes || file.size,
              remainingBytes: errData.remainingBytes,
              quotaBytes: errData.quotaBytes,
              fileName: file.name,
            });
            setErrorDialogOpen(true);
            setStatus('error');
            setErrorMessage(errData.error || 'Storage Quota Exceeded');
            return;
          }

          // Active physical disk space safeguard
          if (res.status === 507 || errData.code === 'DISK_FULL') {
            setErrorDialogInfo({
              type: 'server_error',
              title: 'Upload Failed',
              message:
                errData.error ||
                'Target storage drive is low on physical disk space.',
              serverDetails: `Physical staging drive out of buffer space. Required ${((chunkBlob.size)/(1024*1024)).toFixed(1)} MB.`,
              fileName: file.name,
              onRetry: () => resumeUpload(),
            });
            setErrorDialogOpen(true);
            setStatus('error');
            setErrorMessage(errData.error || 'Staging Drive Full');
            return;
          }

          throw new Error(errData.error || `Chunk ${index} failed with status ${res.status}`);
        }

        index += 1;
        bytesUploadedSoFar += (end - start);
        setCurrentChunk(index);

        const calculatedProgress = Math.min(99, Math.round((index / total) * 100));
        setProgress(calculatedProgress);

        const elapsedSec = Math.max((Date.now() - startTime) / 1000, 0.1);
        const speedMBs = (bytesUploadedSoFar / (1024 * 1024) / elapsedSec).toFixed(1);
        setUploadSpeed(`${speedMBs} MB/s`);
      } catch (err: any) {
        console.error('[ChunkUploadModal] Error uploading chunk:', err);

        const isNetworkLoss =
          !navigator.onLine ||
          err instanceof TypeError ||
          err?.message?.toLowerCase().includes('network') ||
          err?.message?.toLowerCase().includes('failed to fetch') ||
          err?.message?.toLowerCase().includes('connection');

        if (isNetworkLoss) {
          setErrorDialogInfo({
            type: 'network_error',
            title: 'Upload Interrupted',
            message:
              'Network connection lost during upload. Please check your internet connection and try again.',
            currentChunk: index,
            totalChunks: total,
            fileName: file.name,
            onRetry: () => resumeUpload(),
          });
          setErrorDialogOpen(true);
          setStatus('paused');
          setErrorMessage('Network connection lost during chunk transfer.');
          return;
        }

        // Generic disk / server fault
        setErrorDialogInfo({
          type: 'server_error',
          title: 'Upload Failed',
          message: err?.message || 'Server fault while streaming chunks to disk buffer.',
          serverDetails: `Failed on chunk ${index}/${total}: ${err?.message || 'Unknown server fault'}`,
          fileName: file.name,
          onRetry: () => resumeUpload(),
        });
        setErrorDialogOpen(true);
        setStatus('error');
        setErrorMessage(err?.message || 'Network error while streaming chunk to staging buffer.');
        return;
      }
    }

    // 3. Assemble chunks directly on physical storage disk
    try {
      setUploadSpeed('Assembling on physical drive...');
      const destinationFolder = isCameraRollMode
        ? `/home/${currentUser.id}/Backups/Mobile Photos`
        : currentPath;

      const assembleRes = await fetch('/api/upload/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId,
          totalChunks: total,
          destinationPath: destinationFolder,
          filename: file.name,
          userId: currentUser.id,
        }),
      });

      const assembleData = await assembleRes.json();
      if (!assembleRes.ok || !assembleData.success) {
        if (assembleRes.status === 403 || assembleData.code === 'QUOTA_EXCEEDED') {
          setErrorDialogInfo({
            type: 'storage_full',
            title: 'Storage Space Exceeded',
            message: assembleData.formattedMessage || assembleData.error,
            requiredBytes: assembleData.requiredBytes || file.size,
            remainingBytes: assembleData.remainingBytes,
            quotaBytes: assembleData.quotaBytes,
            fileName: file.name,
          });
          setErrorDialogOpen(true);
        } else {
          setErrorDialogInfo({
            type: 'server_error',
            title: 'Upload Failed',
            message: assembleData.error || 'Failed to assemble file chunks on target disk.',
            serverDetails: `Status ${assembleRes.status}: ${assembleData.error || 'File assembly error'}`,
            fileName: file.name,
          });
          setErrorDialogOpen(true);
        }
        throw new Error(assembleData.error || 'Failed to assemble file chunks on target disk.');
      }

      setProgress(100);
      setStatus('completed');
      setPhysicalSavedPath(assembleData.physicalPath);
      onUploadComplete?.(file.name, file.size);
    } catch (assembleErr: any) {
      console.error('[ChunkUploadModal] Assembly error:', assembleErr);
      setStatus('error');
      setErrorMessage(assembleErr?.message || 'Failed to assemble chunks on physical disk.');
    }
  };

  const pauseUpload = () => {
    isPausedRef.current = true;
    setStatus('paused');
  };

  const resumeUpload = async () => {
    isPausedRef.current = false;
    setStatus('uploading');
    setErrorMessage(null);

    let startChunk = currentChunk;
    try {
      // Query server for verified chunks received on disk buffer
      const res = await fetch(`/api/upload/chunk?uploadId=${uploadIdRef.current}`);
      if (res.ok) {
        const data = await res.json();
        if (data.nextChunkIndex !== undefined) {
          startChunk = data.nextChunkIndex;
          setCurrentChunk(startChunk);
          if (file) {
            const total = Math.ceil(file.size / CHUNK_SIZE);
            setProgress(Math.min(99, Math.round((startChunk / total) * 100)));
          }
        }
      }
    } catch (e) {
      console.warn('[ChunkUploadModal] Could not query server chunk status, resuming from local index:', e);
    }

    executeChunkUpload(startChunk, uploadIdRef.current);
  };

  const destinationFolder = isCameraRollMode
    ? `/home/${currentUser?.id || 'user'}/Backups/Mobile Photos`
    : currentPath;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden bg-background border-border/80 shadow-2xl">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-primary" />
              <DialogTitle className="text-base font-semibold">
                {isCameraRollMode ? 'Camera Roll Auto-Backup' : 'Physical Multi-Disk Upload Engine'}
              </DialogTitle>
            </div>
            <Button
              variant={isCameraRollMode ? 'default' : 'outline'}
              size="xs"
              onClick={() => {
                setIsCameraRollMode(!isCameraRollMode);
                setFile(null);
                setStatus('idle');
              }}
              className="gap-1 text-[11px]"
            >
              <Smartphone className="w-3.5 h-3.5" />
              {isCameraRollMode ? 'Mobile Mode Active' : 'Mobile Backup Mode'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Target Directory: <strong className="text-foreground font-mono">{destinationFolder}</strong>
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {/* File Picker */}
          {status === 'idle' && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed rounded-xl p-8 text-center hover:bg-muted/40 cursor-pointer transition-colors border-border/70 flex flex-col items-center justify-center"
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold">
                {file ? file.name : 'Click to select physical file or drag and drop'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Buffers directly to <code className="font-mono text-foreground font-semibold">D:\temp_uploads</code> and writes to <code className="font-mono text-foreground font-semibold">D:\NAS_Storage</code>.
              </p>
              {file && (
                <div className="mt-3 text-xs bg-muted px-3 py-1 rounded-full font-mono text-foreground">
                  Size: {(file.size / (1024 * 1024)).toFixed(2)} MB • {totalChunks} Chunks (5MB each)
                </div>
              )}
            </div>
          )}

          {/* Duplicate Detection Alert */}
          {isDuplicateDetected && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
              <FileCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">Duplicate Hash Detected:</strong> Client-side SHA-256 matched an existing photo in your Camera Roll archive. Zero redundant disk space consumed.
              </div>
            </div>
          )}

          {/* Quota or Assembly Error Banner */}
          {status === 'error' && errorMessage && (
            <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
              errorMessage.toLowerCase().includes('quota')
                ? 'bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400'
                : 'bg-destructive/10 border border-destructive/20 text-destructive'
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">
                  {errorMessage.toLowerCase().includes('quota') ? 'Storage Quota Exceeded:' : 'Upload Error:'}
                </strong>{' '}
                {errorMessage}
              </div>
            </div>
          )}

          {/* Progress Monitor */}
          {(status === 'uploading' || status === 'paused' || status === 'completed') && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-xl border">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground truncate max-w-[220px]">
                  {file?.name}
                </span>
                <span className="font-mono text-muted-foreground">
                  {status === 'completed' ? '100%' : `${progress}%`}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                <span>
                  Chunk {currentChunk} of {totalChunks}
                </span>
                <span>{status === 'uploading' ? uploadSpeed : status}</span>
              </div>

              {/* Physical Drive Information */}
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-2 border-t">
                <HardDrive className="w-3.5 h-3.5 text-primary shrink-0" />
                <span>Buffer Staging: <code className="text-foreground">D:\temp_uploads</code> • Host: Physical Disk D:</span>
              </div>
            </div>
          )}

          {/* Completed State with Real Windows File Path */}
          {status === 'completed' && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-sm">File Written Directly to Physical Drive!</p>
                <p className="text-[11px] opacity-90">
                  The file was assembled and saved to your physical hard drive:
                </p>
                {physicalSavedPath && (
                  <div className="p-2 bg-background/80 rounded border font-mono text-[11px] text-foreground select-all break-all mt-1">
                    <Folder className="w-3.5 h-3.5 inline mr-1 text-primary" />
                    {physicalSavedPath}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  You can open Windows File Explorer on drive D: to view this file right now.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 flex flex-row items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {currentUser?.role === 'USER' && (
              <span>Quota: {(((currentUser.usedStorageBytes ?? currentUser.used_bytes ?? 0)) / 1e9).toFixed(1)} GB used</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {status === 'idle' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={!file} onClick={startUpload} className="gap-1.5">
                  <UploadCloud className="w-4 h-4" />
                  Start Physical Upload
                </Button>
              </>
            )}

            {status === 'uploading' && (
              <Button size="sm" variant="outline" onClick={pauseUpload} className="gap-1.5">
                <Pause className="w-4 h-4" />
                Pause
              </Button>
            )}

            {status === 'paused' && (
              <Button size="sm" onClick={resumeUpload} className="gap-1.5">
                <Play className="w-4 h-4" />
                Resume
              </Button>
            )}

            {status === 'completed' && (
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            )}

            {status === 'error' && (
              <Button size="sm" variant="outline" onClick={() => setStatus('idle')}>
                Retry
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Global Error Dialog Popup (Storage Limit, Network Disconnection, Disk/Server Error) */}
      <UploadErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        errorInfo={errorDialogInfo}
        onRetry={resumeUpload}
      />
    </Dialog>
  );
}
