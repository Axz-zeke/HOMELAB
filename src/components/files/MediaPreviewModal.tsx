'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileItem } from '@/lib/types';
import {
  Download, Film, Image as ImageIcon, Music, Code, FileText, FileArchive,
  ZoomIn, ZoomOut, RotateCcw, Copy, Check, AlertTriangle, RefreshCw,
  ShieldAlert, FileX, HardDrive, Clock, Hash, X,
} from 'lucide-react';

// Extension → correct MIME type for <source type="">
const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  ogv: 'video/ogg',
};

const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  m4a: 'audio/x-m4a',
  opus: 'audio/opus',
};

const TEXT_PREVIEW_LIMIT = 5 * 1024 * 1024; // 5 MB
const TEXT_FETCH_BYTES = 32 * 1024;          // 32 KB preview

interface MediaPreviewModalProps {
  file: FileItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownload?: (file: FileItem) => void;
  userId?: string;
}

export function MediaPreviewModal({
  file,
  open,
  onOpenChange,
  onDownload,
  userId,
}: MediaPreviewModalProps) {
  const [imgZoom, setImgZoom] = useState(1);
  const [imgResolution, setImgResolution] = useState<string | null>(null);

  const handleClose = (v: boolean) => {
    onOpenChange(v);
    setImgZoom(1);
    setImgResolution(null);
  };

  if (!file) return null;

  const formatBytes = (bytes: number) => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const cleanPath = file.path.replace(/^\/+/, '');
  const userParam = userId ? `&userId=${encodeURIComponent(userId)}` : '';
  const streamUrl = `/api/files/stream?path=${encodeURIComponent(cleanPath)}${userParam}`;
  const downloadUrl = `/api/download?path=${encodeURIComponent(cleanPath)}`;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onDownload?.(file);
  };

  const ext = (file.extension || '').toLowerCase();
  const videoMime = VIDEO_MIME[ext] || 'video/mp4';
  const audioMime = AUDIO_MIME[ext] || 'audio/mpeg';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        showCloseButton={false}
        className="w-[95vw] max-w-none h-[88vh] max-h-[88vh] rounded-2xl p-2.5 sm:p-0 overflow-hidden bg-background border-border/80 shadow-2xl flex flex-col justify-between md:max-w-4xl md:h-auto md:max-h-[88vh]"
      >
        {/* ── Header ──────────────────────────────────────────────── */}
        <DialogHeader className="p-3 sm:p-4 sm:px-5 border-b flex flex-row items-center justify-between space-y-0 gap-2 sm:gap-4 shrink-0 bg-card/80 backdrop-blur-xs rounded-t-xl">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="p-2 sm:p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
              {file.category === 'video' && <Film className="w-4 h-4 sm:w-5 sm:h-5" />}
              {file.category === 'image' && <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
              {file.category === 'audio' && <Music className="w-4 h-4 sm:w-5 sm:h-5" />}
              {file.category === 'code' && <Code className="w-4 h-4 sm:w-5 sm:h-5" />}
              {file.category === 'document' && <FileText className="w-4 h-4 sm:w-5 sm:h-5" />}
              {file.category === 'archive' && <FileArchive className="w-4 h-4 sm:w-5 sm:h-5" />}
              {file.category === 'other' && <FileText className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
            <div className="truncate min-w-0 flex-1">
              <DialogTitle className="text-xs sm:text-base font-semibold truncate leading-tight tracking-tight">
                {file.name}
              </DialogTitle>
              <p className="text-[11px] sm:text-xs text-muted-foreground font-mono truncate mt-0.5">
                {file.path} • {formatBytes(file.sizeBytes)}
                {imgResolution && ` • ${imgResolution}`}
              </p>
            </div>
          </div>

          {/* Action controls: Download + Close with min 44px touch targets on mobile */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              className="gap-1.5 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:h-8 px-2 sm:px-3 text-xs shadow-2xs"
              title="Download file"
            >
              <Download className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleClose(false)}
              className="min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground rounded-lg flex items-center justify-center"
              title="Close modal"
            >
              <X className="w-4 h-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </DialogHeader>

        {/* ── Main Preview Area (Centered Viewport Box) ────────────────── */}
        <div className="p-2 sm:p-6 flex flex-col items-center justify-center bg-muted/20 min-h-[260px] sm:min-h-[320px] max-h-[60vh] sm:max-h-[64vh] overflow-y-auto flex-1 w-full">

          {/* ── VIDEO ─────────────────────────────────────────────── */}
          {file.category === 'video' && (
            <VideoPreview
              key={file.path}
              streamUrl={streamUrl}
              videoMime={videoMime}
              fileName={file.name}
              onDownload={handleDownload}
            />
          )}

          {/* ── IMAGE ─────────────────────────────────────────────── */}
          {file.category === 'image' && (
            <ImagePreview
              key={file.path}
              streamUrl={streamUrl}
              file={file}
              imgZoom={imgZoom}
              setImgZoom={setImgZoom}
              setImgResolution={setImgResolution}
              formatBytes={formatBytes}
              onDownload={handleDownload}
            />
          )}

          {/* ── AUDIO ─────────────────────────────────────────────── */}
          {file.category === 'audio' && (
            <AudioPreview
              key={file.path}
              streamUrl={streamUrl}
              audioMime={audioMime}
              file={file}
              formatBytes={formatBytes}
              onDownload={handleDownload}
            />
          )}

          {/* ── CODE / TEXT ───────────────────────────────────────── */}
          {file.category === 'code' && (
            <CodePreview
              key={file.path}
              streamUrl={streamUrl}
              file={file}
              onDownload={handleDownload}
            />
          )}

          {/* ── DOCUMENT / PDF ────────────────────────────────────── */}
          {file.category === 'document' && (
            <DocumentPreview
              key={file.path}
              streamUrl={streamUrl}
              file={file}
              formatBytes={formatBytes}
              onDownload={handleDownload}
            />
          )}

          {/* ── ARCHIVE / OTHER ───────────────────────────────────── */}
          {['archive', 'other'].includes(file.category) && (
            <ArchiveCard file={file} formatBytes={formatBytes} onDownload={handleDownload} />
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="p-3 px-6 bg-muted/40 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5" />
            Local Storage • HTTP Range Streaming
          </span>
          <span className="font-mono">
            Drive {file.physicalDiskLetter || file.driveVolumeId?.replace('vol-', '') || 'D'}:
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
function VideoPreview({
  streamUrl,
  videoMime,
  fileName,
  onDownload,
}: {
  streamUrl: string;
  videoMime: string;
  fileName: string;
  onDownload: () => void;
}) {
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  };

  if (error) {
    return (
      <MediaErrorCard
        title="Video Playback Failed"
        message={`The browser could not decode "${fileName}". The file may be encoded in an unsupported codec or is corrupted.`}
        onRetry={() => { setError(false); setRetryKey((k) => k + 1); }}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <div className="w-full max-h-[55vh] flex items-center justify-center bg-black/95 rounded-xl overflow-hidden shadow-lg border border-border/30">
        <video
          ref={videoRef}
          controls
          autoPlay={false}
          preload="metadata"
          className="w-full max-h-[55vh] object-contain rounded-lg"
          key={`video-${retryKey}`}
          onError={() => setError(true)}
        >
          <source src={streamUrl} type={videoMime} />
          Your browser does not support HTML5 video streaming.
        </video>
      </div>
      {/* Playback speed */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-xs text-muted-foreground">
        <span>Speed:</span>
        {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
          <button
            key={rate}
            onClick={() => handleRateChange(rate)}
            className={`min-h-[36px] sm:min-h-0 px-2 py-1 sm:py-0.5 rounded text-[11px] font-mono border transition-colors ${
              playbackRate === rate
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/60 border-border/60 hover:bg-muted text-muted-foreground'
            }`}
          >
            {rate}×
          </button>
        ))}
        <Badge variant="outline" className="text-[9px] font-mono ml-1 py-0">HTTP 206</Badge>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
function ImagePreview({
  streamUrl,
  file,
  imgZoom,
  setImgZoom,
  setImgResolution,
  formatBytes,
  onDownload,
}: {
  streamUrl: string;
  file: FileItem;
  imgZoom: number;
  setImgZoom: React.Dispatch<React.SetStateAction<number>>;
  setImgResolution: (r: string | null) => void;
  formatBytes: (b: number) => string;
  onDownload: () => void;
}) {
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  if (error) {
    return (
      <MediaErrorCard
        title="Image Could Not Be Loaded"
        message={`"${file.name}" could not be decoded. The file may be corrupted or in an unsupported format.`}
        onRetry={() => { setError(false); setRetryKey((k) => k + 1); }}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center gap-2">
      {/* Zoom controls */}
      <div className="flex items-center gap-1.5 sm:gap-2 self-end">
        <Button variant="outline" size="xs" onClick={() => setImgZoom((z) => Math.max(0.25, z - 0.25))} className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7 p-0">
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs font-mono text-muted-foreground w-12 text-center">{Math.round(imgZoom * 100)}%</span>
        <Button variant="outline" size="xs" onClick={() => setImgZoom((z) => Math.min(4, z + 0.25))} className="min-h-[36px] min-w-[36px] sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7 p-0">
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button variant="outline" size="xs" onClick={() => setImgZoom(1)} className="min-h-[36px] sm:min-h-0 sm:h-7 px-2 text-xs gap-1">
          <RotateCcw className="w-3 h-3" /> Reset
        </Button>
      </div>

      {/* Responsive Image Container */}
      <div className="flex-1 flex items-center justify-center overflow-hidden w-full rounded-xl bg-[repeating-conic-gradient(#9999991a_0%_25%,transparent_0%_50%)] bg-[length:20px_20px] border border-border/40 min-h-[240px] max-h-[60vh] p-1 sm:p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={streamUrl}
          alt={file.name}
          key={`img-${retryKey}`}
          style={{ transform: `scale(${imgZoom})`, transformOrigin: 'center', transition: 'transform 0.2s ease' }}
          className="max-h-[60vh] w-auto max-w-full object-contain select-none"
          onLoad={(e) => {
            const img = e.target as HTMLImageElement;
            setImgResolution(`${img.naturalWidth}×${img.naturalHeight}px`);
          }}
          onError={() => setError(true)}
        />
      </div>

      <p className="text-[11px] sm:text-xs text-muted-foreground font-mono text-center truncate max-w-full">
        {file.name} • {formatBytes(file.sizeBytes)} • Drive {file.physicalDiskLetter || 'D'}:
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
function AudioPreview({
  streamUrl,
  audioMime,
  file,
  formatBytes,
  onDownload,
}: {
  streamUrl: string;
  audioMime: string;
  file: FileItem;
  formatBytes: (b: number) => string;
  onDownload: () => void;
}) {
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  if (error) {
    return (
      <MediaErrorCard
        title="Audio Playback Failed"
        message={`"${file.name}" could not be decoded. The codec may not be supported by this browser.`}
        onRetry={() => { setError(false); setRetryKey((k) => k + 1); }}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="w-full max-w-md p-6 bg-card rounded-2xl border border-border/80 shadow-sm flex flex-col items-center gap-4">
      {/* Animated waveform icon */}
      <div className="w-20 h-20 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center shadow-inner relative">
        <Music className="w-10 h-10" />
        <span className="absolute inset-0 rounded-full ring-2 ring-emerald-500/20 animate-ping" style={{ animationDuration: '2s' }} />
      </div>
      <div className="text-center">
        <h4 className="font-semibold text-base mb-0.5 truncate max-w-xs">{file.name}</h4>
        <p className="text-xs text-muted-foreground font-mono">
          {file.extension?.toUpperCase()} Audio • {formatBytes(file.sizeBytes)}
        </p>
      </div>
      <audio
        controls
        className="w-full"
        key={`audio-${retryKey}`}
        onError={() => setError(true)}
      >
        <source src={streamUrl} type={audioMime} />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CODE / TEXT PREVIEW  
// ─────────────────────────────────────────────────────────────────────────────
function CodePreview({
  streamUrl,
  file,
  onDownload,
}: {
  streamUrl: string;
  file: FileItem;
  onDownload: () => void;
}) {
  // Guard: skip fetch for files > 5 MB
  if (file.sizeBytes > TEXT_PREVIEW_LIMIT) {
    return (
      <div className="w-full max-w-lg p-8 bg-card rounded-2xl border border-border/80 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div>
          <h4 className="font-semibold text-base">File Too Large to Preview</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Inline rendering is limited to 5 MB. This file is{' '}
            <span className="font-mono font-semibold">
              {(file.sizeBytes / 1_048_576).toFixed(1)} MB
            </span>
            . Download it to view in a dedicated editor.
          </p>
        </div>
        <Button onClick={onDownload} className="gap-2">
          <Download className="w-4 h-4" />
          Download to View
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <RemoteTextPreview url={streamUrl} filename={file.name} ext={file.extension || 'txt'} onDownload={onDownload} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT / PDF PREVIEW
// ─────────────────────────────────────────────────────────────────────────────
function DocumentPreview({
  streamUrl,
  file,
  formatBytes,
  onDownload,
}: {
  streamUrl: string;
  file: FileItem;
  formatBytes: (b: number) => string;
  onDownload: () => void;
}) {
  if (file.extension === 'pdf') {
    return (
      <div className="w-full flex flex-col items-center gap-3">
        <div className="w-full rounded-xl overflow-hidden border border-border/40 bg-card" style={{ height: '55vh' }}>
          <embed
            src={streamUrl}
            type="application/pdf"
            className="w-full h-full"
            title={file.name}
          />
        </div>
        <p className="text-xs text-muted-foreground font-mono">
          PDF • {formatBytes(file.sizeBytes)}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8 bg-card rounded-2xl border border-border/80 text-center flex flex-col items-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
        <FileText className="w-8 h-8" />
      </div>
      <div>
        <h4 className="font-semibold text-base truncate max-w-xs">{file.name}</h4>
        <p className="text-xs text-muted-foreground mt-1">
          {file.extension?.toUpperCase() || 'Document'} • {formatBytes(file.sizeBytes)}
        </p>
      </div>
      <Button onClick={onDownload} className="gap-2">
        <Download className="w-4 h-4" />
        Download &amp; Open
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVE / BINARY CARD
// ─────────────────────────────────────────────────────────────────────────────
function ArchiveCard({
  file,
  formatBytes,
  onDownload,
}: {
  file: FileItem;
  formatBytes: (b: number) => string;
  onDownload: () => void;
}) {
  return (
    <div className="w-full max-w-md p-8 bg-card rounded-2xl border border-border/80 text-center flex flex-col items-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
        <FileArchive className="w-8 h-8" />
      </div>
      {/* Extension badge */}
      <Badge variant="outline" className="font-mono text-xs px-3 py-1 uppercase bg-muted/40">
        .{file.extension || 'BIN'}
      </Badge>
      <div className="space-y-1.5 text-xs text-muted-foreground w-full">
        <div className="flex justify-between items-center bg-muted/30 rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" />Size</span>
          <span className="font-mono font-semibold text-foreground">{formatBytes(file.sizeBytes)}</span>
        </div>
        <div className="flex justify-between items-center bg-muted/30 rounded-lg px-3 py-2">
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />Modified</span>
          <span className="font-mono text-foreground">{new Date(file.modifiedAt).toLocaleDateString()}</span>
        </div>
        {file.physicalDiskLetter && (
          <div className="flex justify-between items-center bg-muted/30 rounded-lg px-3 py-2">
            <span className="flex items-center gap-1.5"><HardDrive className="w-3.5 h-3.5" />Pool</span>
            <span className="font-mono text-foreground">Drive {file.physicalDiskLetter}:</span>
          </div>
        )}
      </div>
      <Button onClick={onDownload} className="gap-2 w-full max-w-xs">
        <Download className="w-4 h-4" />
        Download {file.extension === 'iso' ? 'ISO Image' : 'File'}
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED ERROR CARD
// ─────────────────────────────────────────────────────────────────────────────
function MediaErrorCard({
  title,
  message,
  onRetry,
  onDownload,
  icon: Icon = AlertTriangle,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  onDownload: () => void;
  icon?: React.ElementType;
}) {
  return (
    <div className="w-full max-w-md p-8 bg-card rounded-2xl border border-destructive/30 text-center flex flex-col items-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
        <Icon className="w-8 h-8" />
      </div>
      <div>
        <h4 className="font-semibold text-base text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onRetry} className="gap-1.5 text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Preview
        </Button>
        <Button onClick={onDownload} className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" />
          Download File
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REMOTE TEXT PREVIEW — line numbers, 32KB, copy button, error states
// ─────────────────────────────────────────────────────────────────────────────
function RemoteTextPreview({
  url,
  filename,
  ext,
  onDownload,
}: {
  url: string;
  filename: string;
  ext: string;
  onDownload: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<{ status: number; message: string } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent(null);
    setFetchError(null);

    fetch(url, { headers: { Range: `bytes=0-${TEXT_FETCH_BYTES - 1}` } })
      .then(async (r) => {
        if (!r.ok && r.status !== 206 && r.status !== 200) {
          const body = await r.text().catch(() => '');
          throw { status: r.status, message: body || r.statusText };
        }
        return r.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text.slice(0, TEXT_FETCH_BYTES));
          setLoading(false);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setFetchError({ status: err?.status ?? 0, message: err?.message ?? 'Unknown error' });
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [url, retryKey]);

  const copyToClipboard = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="w-full rounded-xl border border-border/50 bg-muted/40 overflow-hidden animate-pulse" style={{ minHeight: '320px' }}>
        <div className="h-10 bg-muted/60 border-b border-border/50 flex items-center px-4 gap-3">
          <div className="h-3 w-24 bg-muted-foreground/20 rounded" />
          <div className="h-3 w-12 bg-muted-foreground/10 rounded ml-auto" />
        </div>
        <div className="p-4 space-y-2">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-6 h-3 bg-muted-foreground/10 rounded shrink-0" />
              <div className="h-3 bg-muted-foreground/15 rounded" style={{ width: `${55 + Math.random() * 40}%` }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fetchError) {
    const is403 = fetchError.status === 403;
    const is404 = fetchError.status === 404;
    return (
      <div className="w-full max-w-md p-8 bg-card rounded-2xl border border-destructive/30 text-center flex flex-col items-center gap-4 mx-auto">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${is403 ? 'bg-amber-500/10 text-amber-500' : 'bg-destructive/10 text-destructive'}`}>
          {is403 ? <ShieldAlert className="w-8 h-8" /> : is404 ? <FileX className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
        </div>
        <div>
          <h4 className="font-semibold text-base">
            {is403 ? 'Access Denied' : is404 ? 'File No Longer Exists' : 'Preview Unavailable'}
          </h4>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs">
            {is403
              ? 'You do not have read permissions for this item.'
              : is404
              ? 'This file could not be found on physical storage. It may have been moved or deleted.'
              : fetchError.message}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRetryKey((k) => k + 1)} className="gap-1.5 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
          {!is403 && (
            <Button onClick={onDownload} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              Download
            </Button>
          )}
        </div>
      </div>
    );
  }

  const lines = (content ?? '').split('\n');

  return (
    <div className="w-full rounded-xl border border-border/60 bg-[hsl(var(--muted)/0.5)] overflow-hidden">
      {/* Code viewer header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/70 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <Code className="w-4 h-4 text-muted-foreground" />
          <span className="font-mono text-xs font-semibold text-foreground">{filename}</span>
          <Badge variant="outline" className="text-[10px] font-mono uppercase py-0 px-1.5">{ext}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono">{lines.length} lines</span>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border/60 bg-background/70 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
      {/* Line-numbered content */}
      <div className="max-h-[55vh] overflow-y-auto overflow-x-auto text-xs p-1 sm:p-2.5 font-mono">
        <table className="w-full text-[11px] sm:text-[12px] font-mono leading-relaxed border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="group hover:bg-primary/5">
                <td className="select-none text-right pr-2 sm:pr-4 pl-2 sm:pl-3 py-0 text-muted-foreground/40 group-hover:text-muted-foreground/60 border-r border-border/30 w-8 sm:w-10 shrink-0 font-mono text-[10px] sm:text-[11px]">
                  {i + 1}
                </td>
                <td className="pl-2 sm:pl-4 pr-2 sm:pr-3 py-0 text-foreground/85 whitespace-pre-wrap break-all">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {content && content.length >= TEXT_FETCH_BYTES - 1 && (
        <div className="px-4 py-2 border-t border-border/40 bg-muted/40 text-[11px] text-muted-foreground font-mono text-center">
          Showing first {Math.round(TEXT_FETCH_BYTES / 1024)} KB — download to view full file
        </div>
      )}
    </div>
  );
}
