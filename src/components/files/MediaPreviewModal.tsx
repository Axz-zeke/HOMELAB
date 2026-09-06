'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileItem } from '@/lib/types';
import { Download, Film, Image as ImageIcon, Music, Code, FileText, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface MediaPreviewModalProps {
  file: FileItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: (file: FileItem) => void;
}

export function MediaPreviewModal({
  file,
  open,
  onOpenChange,
  onDownload,
}: MediaPreviewModalProps) {
  const [imgZoom, setImgZoom] = useState(1);

  if (!file) return null;

  const formatBytes = (bytes: number) => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  // Use the stream API for media, download API for files
  const streamUrl = `/api/stream?path=${encodeURIComponent(file.path.replace(/^\//, ''))}`;
  const downloadUrl = `/api/download?path=${encodeURIComponent(file.path.replace(/^\//, ''))}`;

  const handleDownload = () => {
    // Trigger real download via browser
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onDownload?.(file);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); setImgZoom(1); }}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-background border-border/80 shadow-2xl">
        <DialogHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3 min-w-0 pr-6">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              {file.category === 'video' && <Film className="w-5 h-5" />}
              {file.category === 'image' && <ImageIcon className="w-5 h-5" />}
              {file.category === 'audio' && <Music className="w-5 h-5" />}
              {file.category === 'code' && <Code className="w-5 h-5" />}
              {file.category === 'document' && <FileText className="w-5 h-5" />}
            </div>
            <div className="truncate">
              <DialogTitle className="text-base font-semibold truncate leading-tight">
                {file.name}
              </DialogTitle>
              <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                {file.path} • {formatBytes(file.sizeBytes)}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="gap-1.5 shrink-0"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
        </DialogHeader>

        <div className="p-6 flex flex-col items-center justify-center bg-muted/20 min-h-[340px] max-h-[72vh] overflow-y-auto">
          {/* VIDEO PREVIEW */}
          {file.category === 'video' && (
            <div className="w-full flex flex-col items-center">
              <div className="w-full aspect-video bg-black/95 rounded-xl overflow-hidden shadow-lg">
                <video
                  controls
                  autoPlay={false}
                  preload="metadata"
                  className="w-full h-full object-contain"
                  key={file.path}
                >
                  <source src={streamUrl} type="video/mp4" />
                  <source src={streamUrl} type="video/webm" />
                  Your browser does not support HTML5 video streaming.
                </video>
              </div>
              <p className="text-xs text-muted-foreground mt-3 font-mono">
                Hardware Accelerated Direct Stream • HTTP Range Protocol • Zero Transcoding
              </p>
            </div>
          )}

          {/* IMAGE PREVIEW with zoom */}
          {file.category === 'image' && (
            <div className="w-full flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 self-end">
                <Button variant="outline" size="xs" onClick={() => setImgZoom((z) => Math.max(0.25, z - 0.25))} className="h-7 w-7 p-0">
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs font-mono text-muted-foreground w-12 text-center">{Math.round(imgZoom * 100)}%</span>
                <Button variant="outline" size="xs" onClick={() => setImgZoom((z) => Math.min(4, z + 0.25))} className="h-7 w-7 p-0">
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="xs" onClick={() => setImgZoom(1)} className="h-7 px-2 text-xs">Reset</Button>
              </div>
              <div className="w-full rounded-xl overflow-auto flex items-center justify-center bg-[repeating-conic-gradient(#9999991a_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] border border-border/40 min-h-[280px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={streamUrl}
                  alt={file.name}
                  key={file.path}
                  style={{ transform: `scale(${imgZoom})`, transformOrigin: 'center', transition: 'transform 0.2s ease' }}
                  className="max-w-full max-h-[50vh] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="p-8 text-center text-sm text-muted-foreground"><p>Preview unavailable</p><p class="text-xs mt-1 font-mono">${file.name}</p></div>`;
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {file.name} • {formatBytes(file.sizeBytes)} • Drive {file.physicalDiskLetter || 'D'}:
              </p>
            </div>
          )}

          {/* AUDIO PREVIEW */}
          {file.category === 'audio' && (
            <div className="w-full max-w-md p-6 bg-card rounded-2xl border shadow-sm flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-4 shadow-inner">
                <Music className="w-10 h-10" />
              </div>
              <h4 className="font-semibold text-center text-base mb-1">{file.name}</h4>
              <p className="text-xs text-muted-foreground font-mono mb-6">
                {file.extension?.toUpperCase()} Audio • {formatBytes(file.sizeBytes)}
              </p>
              <audio controls className="w-full" key={file.path}>
                <source src={streamUrl} />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}

          {/* CODE / MARKDOWN / TEXT PREVIEW */}
          {file.category === 'code' && (
            <div className="w-full bg-muted/80 rounded-xl p-4 border font-mono text-xs overflow-x-auto text-left leading-relaxed">
              <div className="text-muted-foreground pb-2 mb-2 border-b border-border/40 flex justify-between">
                <span>Preview: {file.name}</span>
                <span className="uppercase">{file.extension || 'CODE'}</span>
              </div>
              <RemoteTextPreview url={streamUrl} filename={file.name} />
            </div>
          )}

          {/* DOCUMENT / PDF PREVIEW */}
          {file.category === 'document' && (
            <div className="w-full flex flex-col items-center gap-4">
              {file.extension === 'pdf' ? (
                <div className="w-full rounded-xl overflow-hidden border border-border/40 bg-card" style={{ height: '55vh' }}>
                  <embed
                    src={streamUrl}
                    type="application/pdf"
                    className="w-full h-full"
                    title={file.name}
                  />
                </div>
              ) : (
                <div className="w-full max-w-md p-8 bg-card rounded-2xl border text-center flex flex-col items-center">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8" />
                  </div>
                  <h4 className="font-semibold text-base">{file.name}</h4>
                  <p className="text-xs text-muted-foreground mt-1 mb-6">
                    {file.extension?.toUpperCase() || 'Document'} • {formatBytes(file.sizeBytes)}
                  </p>
                  <Button onClick={handleDownload} className="gap-2">
                    <Download className="w-4 h-4" />
                    Download & Open
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* ARCHIVE / OTHER */}
          {['archive', 'other'].includes(file.category) && (
            <div className="w-full max-w-md p-8 bg-card rounded-2xl border text-center flex flex-col items-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Download className="w-8 h-8" />
              </div>
              <h4 className="font-semibold text-base">{file.name}</h4>
              <p className="text-xs text-muted-foreground mt-1 mb-6">
                {file.extension?.toUpperCase() || 'Binary'} • {formatBytes(file.sizeBytes)}
              </p>
              <Button onClick={handleDownload} className="gap-2">
                <Download className="w-4 h-4" />
                Download {file.extension === 'iso' ? 'ISO Image' : 'File'}
              </Button>
            </div>
          )}
        </div>

        <div className="p-3 px-6 bg-muted/40 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>Local Storage • Offline Ready</span>
          <span className="font-mono">Drive {file.physicalDiskLetter || file.driveVolumeId?.replace('vol-', '') || 'D'}:</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Client-side text content fetcher for code/text file previews.
 * Fetches up to 8KB of the file via streaming API.
 */
function RemoteTextPreview({ url, filename }: { url: string; filename: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent(null);
    fetch(url, {
      headers: { Range: 'bytes=0-8191' }, // fetch first 8KB for preview
    })
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) {
          setContent(text.slice(0, 8192));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent(`# ${filename}\n# (Preview could not be loaded from physical storage)`);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [url, filename]);

  if (loading) return <div className="text-muted-foreground animate-pulse">Loading file preview...</div>;
  return <pre className="text-foreground/90 whitespace-pre-wrap break-words">{content}</pre>;
}
