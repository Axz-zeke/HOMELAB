'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Pause, Play, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { checkQuota } from '@/lib/actions/quota';
import { UploadErrorDialog, UploadErrorInfo } from '@/components/upload/UploadErrorDialog';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

type UploadJob = {
  id: string;
  file: File;
  filename: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
  status: 'pending' | 'uploading' | 'paused' | 'complete' | 'error';
  errorMessage?: string;
};

export function UploadDrawer({ destinationPath }: { destinationPath: string }) {
  const { currentUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const pausedRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Global Error Dialog state
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogInfo, setErrorDialogInfo] = useState<UploadErrorInfo | null>(null);

  const updateJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...patch } : j))
    );
  }, []);

  const resumeJob = useCallback(async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    pausedRef.current.delete(jobId);
    updateJob(jobId, { status: 'uploading', errorMessage: undefined });

    // Query server for verified chunks received on disk buffer
    try {
      const res = await fetch(`/api/upload/chunk?uploadId=${jobId}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.receivedChunks)) {
          const updatedChunks = new Set([...job.uploadedChunks, ...data.receivedChunks]);
          updateJob(jobId, { uploadedChunks: updatedChunks });
        }
      }
    } catch (e) {
      console.warn('[UploadDrawer] Server chunk query warning:', e);
    }

    // Re-run upload loop
    uploadFile(job.file, jobId);
  }, [jobs, updateJob]);

  const uploadFile = useCallback(
    async (file: File, existingId?: string) => {
      if (!currentUser) return;
      // 1. Pre-Upload Quota Verification
      const quota = await checkQuota(currentUser.id, file.size);
      if (!quota.allowed) {
        setErrorDialogInfo({
          type: 'storage_full',
          title: 'Storage Space Exceeded',
          message: quota.formattedMessage || quota.error,
          requiredBytes: quota.requiredBytes || file.size,
          remainingBytes: quota.remainingBytes,
          quotaBytes: quota.quotaBytes,
          usedBytes: quota.usedBytes,
          fileName: file.name,
        });
        setErrorDialogOpen(true);
        return;
      }

      const uploadId = existingId || uuidv4();
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Check LocalStorage for previous partial upload
      const resumeKey = `upload_${file.name}_${file.size}`;
      const savedState = localStorage.getItem(resumeKey);
      const resumedChunks: number[] = savedState ? JSON.parse(savedState) : [];

      const currentJob = jobs.find((j) => j.id === uploadId);
      const initialUploaded = currentJob
        ? currentJob.uploadedChunks
        : new Set(resumedChunks);

      const job: UploadJob = {
        id: uploadId,
        file,
        filename: file.name,
        totalChunks,
        uploadedChunks: initialUploaded,
        status: 'uploading',
      };

      setJobs((prev) => {
        const exists = prev.some((j) => j.id === uploadId);
        if (exists) {
          return prev.map((j) => (j.id === uploadId ? job : j));
        }
        return [...prev, job];
      });

      // Upload each chunk sequentially, respecting pause state
      for (let i = 0; i < totalChunks; i++) {
        if (job.uploadedChunks.has(i)) continue; // Skip already-uploaded chunks

        // Pause check loop
        while (pausedRef.current.has(uploadId)) {
          await new Promise((r) => setTimeout(r, 300));
        }

        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const fd = new FormData();
        fd.append('uploadId', uploadId);
        fd.append('chunkIndex', String(i));
        fd.append('chunk', chunk);
        fd.append('userId', currentUser.id);

        try {
          const res = await fetch('/api/upload/chunk', { method: 'POST', body: fd });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            if (res.status === 403 || errData.code === 'QUOTA_EXCEEDED') {
              setErrorDialogInfo({
                type: 'storage_full',
                title: 'Storage Space Exceeded',
                message: errData.formattedMessage || errData.error || 'Storage quota exceeded mid-transfer.',
                requiredBytes: errData.requiredBytes || file.size,
                remainingBytes: errData.remainingBytes,
                quotaBytes: errData.quotaBytes,
                fileName: file.name,
              });
              setErrorDialogOpen(true);
              updateJob(uploadId, { status: 'error', errorMessage: 'Storage Quota Exceeded' });
              return;
            }

            if (res.status === 507 || errData.code === 'DISK_FULL') {
              setErrorDialogInfo({
                type: 'server_error',
                title: 'Upload Failed',
                message: errData.error || 'Target storage drive is low on physical disk space.',
                serverDetails: `Physical staging drive out of buffer space. Required ${((chunk.size)/(1024*1024)).toFixed(1)} MB.`,
                fileName: file.name,
                onRetry: () => resumeJob(uploadId),
              });
              setErrorDialogOpen(true);
              updateJob(uploadId, { status: 'error', errorMessage: 'Disk full' });
              return;
            }

            throw new Error(errData.error || 'Chunk upload failed');
          }
        } catch (chunkErr: any) {
          const isNetworkError =
            !navigator.onLine ||
            chunkErr instanceof TypeError ||
            chunkErr?.message?.toLowerCase().includes('network') ||
            chunkErr?.message?.toLowerCase().includes('failed to fetch') ||
            chunkErr?.message?.toLowerCase().includes('connection');

          if (isNetworkError) {
            setErrorDialogInfo({
              type: 'network_error',
              title: 'Upload Interrupted',
              message: 'Network connection lost during upload. Please check your internet connection and try again.',
              currentChunk: i,
              totalChunks,
              fileName: file.name,
              onRetry: () => resumeJob(uploadId),
            });
            setErrorDialogOpen(true);
          } else {
            setErrorDialogInfo({
              type: 'server_error',
              title: 'Upload Failed',
              message: chunkErr?.message || 'Server error uploading chunk.',
              fileName: file.name,
              onRetry: () => resumeJob(uploadId),
            });
            setErrorDialogOpen(true);
          }

          updateJob(uploadId, { status: 'error', errorMessage: `Failed on chunk ${i}` });
          return;
        }

        job.uploadedChunks.add(i);
        // Persist progress to LocalStorage for resume capability
        localStorage.setItem(resumeKey, JSON.stringify([...job.uploadedChunks]));
        updateJob(uploadId, { uploadedChunks: new Set(job.uploadedChunks) });
      }

      // All chunks uploaded — trigger assembly
      try {
        const res = await fetch('/api/upload/assemble', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId,
            totalChunks,
            destinationPath,
            filename: file.name,
            userId: currentUser.id,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          if (res.status === 403 || data.code === 'QUOTA_EXCEEDED') {
            setErrorDialogInfo({
              type: 'storage_full',
              title: 'Storage Space Exceeded',
              message: data.formattedMessage || data.error,
              requiredBytes: data.requiredBytes || file.size,
              remainingBytes: data.remainingBytes,
              quotaBytes: data.quotaBytes,
              fileName: file.name,
            });
            setErrorDialogOpen(true);
          } else {
            setErrorDialogInfo({
              type: 'server_error',
              title: 'Upload Failed',
              message: data.error || 'Failed to assemble file on physical storage',
              fileName: file.name,
            });
            setErrorDialogOpen(true);
          }
          throw new Error(data.error || 'Assembly failed');
        }

        localStorage.removeItem(resumeKey);
        updateJob(uploadId, { status: 'complete' });
      } catch {
        updateJob(uploadId, { status: 'error', errorMessage: 'Failed to assemble file' });
      }
    },
    [destinationPath, updateJob, currentUser?.id, jobs, resumeJob]
  );

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      uploadFile(file);
    }
  };

  const togglePause = (jobId: string, current: 'uploading' | 'paused') => {
    if (current === 'uploading') {
      pausedRef.current.add(jobId);
      updateJob(jobId, { status: 'paused' });
    } else {
      pausedRef.current.delete(jobId);
      updateJob(jobId, { status: 'uploading' });
      const job = jobs.find((j) => j.id === jobId);
      if (job) {
        uploadFile(job.file, jobId);
      }
    }
  };

  return (
    <>
      {/* Trigger */}
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Upload className="w-4 h-4" />
        Upload Files
      </Button>

      {/* Drawer */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-96 shadow-2xl">
          <Card className="border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Upload Manager</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Drop zone */}
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Drop files here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Unlimited size chunked upload (5 MB parts) — bounded by user quota
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>

              {/* Upload jobs list */}
              {jobs.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {jobs.map((job) => {
                    const pct = Math.round((job.uploadedChunks.size / job.totalChunks) * 100);
                    return (
                      <div key={job.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium truncate flex-1">{job.filename}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {job.status === 'complete' && <CheckCircle className="w-4 h-4 text-green-500" />}
                            {job.status === 'error' && (
                              <button
                                onClick={() => resumeJob(job.id)}
                                title="Retry upload"
                                className="text-destructive hover:underline"
                              >
                                <AlertCircle className="w-4 h-4" />
                              </button>
                            )}
                            {(job.status === 'uploading' || job.status === 'paused') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => togglePause(job.id, job.status as 'uploading' | 'paused')}
                              >
                                {job.status === 'uploading' ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className={cn(
                              'h-1.5 rounded-full transition-all',
                              job.status === 'complete' ? 'bg-green-500' :
                              job.status === 'error' ? 'bg-destructive' :
                              job.status === 'paused' ? 'bg-amber-500' : 'bg-primary'
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span className="capitalize">{job.status}</span>
                          <span>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Global Error Dialog Popup */}
      <UploadErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        errorInfo={errorDialogInfo}
      />
    </>
  );
}
