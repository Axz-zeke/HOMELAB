'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Pause, Play, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk

type UploadJob = {
  id: string;
  filename: string;
  totalChunks: number;
  uploadedChunks: Set<number>;
  status: 'pending' | 'uploading' | 'paused' | 'complete' | 'error';
  errorMessage?: string;
};

export function UploadDrawer({ destinationPath }: { destinationPath: string }) {
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const pausedRef = useRef<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === id ? { ...j, ...patch } : j))
    );
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      const uploadId = uuidv4();
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Check LocalStorage for a previous partial upload of same filename+size
      const resumeKey = `upload_${file.name}_${file.size}`;
      const savedState = localStorage.getItem(resumeKey);
      const resumedChunks: number[] = savedState ? JSON.parse(savedState) : [];

      const job: UploadJob = {
        id: uploadId,
        filename: file.name,
        totalChunks,
        uploadedChunks: new Set(resumedChunks),
        status: 'uploading',
      };

      setJobs((prev) => [...prev, job]);

      // Upload each chunk sequentially, respecting pause state
      for (let i = 0; i < totalChunks; i++) {
        if (job.uploadedChunks.has(i)) continue; // Skip already-uploaded chunks (resume)

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

        try {
          const res = await fetch('/api/upload/chunk', { method: 'POST', body: fd });
          if (!res.ok) throw new Error('Chunk upload failed');
        } catch {
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
          }),
        });
        if (!res.ok) throw new Error('Assembly failed');
        localStorage.removeItem(resumeKey);
        updateJob(uploadId, { status: 'complete' });
      } catch {
        updateJob(uploadId, { status: 'error', errorMessage: 'Failed to assemble file' });
      }
    },
    [destinationPath, updateJob]
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
                <p className="text-xs text-muted-foreground mt-1">Chunked upload (5 MB parts) — supports multi-GB files</p>
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
                            {job.status === 'error' && <AlertCircle className="w-4 h-4 text-destructive" />}
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
    </>
  );
}
