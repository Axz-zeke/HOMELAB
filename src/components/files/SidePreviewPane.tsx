'use client';

import React, { useState, useEffect } from 'react';
import { FileItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  X, Eye, Film, Image as ImageIcon, Music, Code, FileText, Archive,
  Download, Share2, Maximize2, ZoomIn, ZoomOut, RotateCcw, Copy, Check,
  HardDrive, Calendar, FileQuestion, Folder, AlertTriangle, RefreshCw,
  ShieldAlert, FileX,
} from 'lucide-react';

const TEXT_PREVIEW_BYTES = 32 * 1024; // 32 KB

// Extension → correct MIME type
const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm',
  mkv: 'video/x-matroska', mov: 'video/quicktime',
  avi: 'video/x-msvideo', ogv: 'video/ogg',
};
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav',
  aac: 'audio/aac', ogg: 'audio/ogg', m4a: 'audio/x-m4a', opus: 'audio/opus',
};

interface SidePreviewPaneProps {
  selectedItem: FileItem | null;
  mode: 'preview' | 'details';
  onModeChange: (mode: 'preview' | 'details') => void;
  userId: string;
  onClose: () => void;
  onOpenModal: (file: FileItem) => void;
  onDownload: (file: FileItem) => void;
  onShare: (file: FileItem) => void;
  onNavigateFolder?: (path: string) => void;
}

export function SidePreviewPane({
  selectedItem,
  mode,
  onModeChange,
  userId,
  onClose,
  onOpenModal,
  onDownload,
  onShare,
  onNavigateFolder,
}: SidePreviewPaneProps) {
  const [imgZoom, setImgZoom] = useState(1);

  // Reset state when item changes
  useEffect(() => {
    setImgZoom(1);
  }, [selectedItem?.path]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '--';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const normalizedPath = selectedItem
    ? selectedItem.path.startsWith('/')
      ? selectedItem.path
      : `/${selectedItem.path}`
    : '';

  const streamUrl = selectedItem
    ? `/api/files/stream?path=${encodeURIComponent(normalizedPath)}&userId=${encodeURIComponent(userId)}`
    : '';

  const getCategoryIcon = (item: FileItem) => {
    if (item.isDirectory) return <Folder className="w-5 h-5 text-primary fill-primary/20" />;
    switch (item.category) {
      case 'video':   return <Film      className="w-5 h-5 text-indigo-500" />;
      case 'image':   return <ImageIcon className="w-5 h-5 text-sky-500" />;
      case 'audio':   return <Music     className="w-5 h-5 text-emerald-500" />;
      case 'code':    return <Code      className="w-5 h-5 text-amber-500" />;
      case 'archive': return <Archive   className="w-5 h-5 text-purple-500" />;
      default:        return <FileText  className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const ext = (selectedItem?.extension || '').toLowerCase();
  const videoMime = VIDEO_MIME[ext] || 'video/mp4';
  const audioMime = AUDIO_MIME[ext] || 'audio/mpeg';

  return (
    <aside
      className="w-80 sm:w-96 shrink-0 bg-card/90 backdrop-blur-md border border-border/80 rounded-xl overflow-hidden shadow-sm flex flex-col transition-all duration-200"
      aria-label="Preview and Details Pane"
    >
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div className="p-3 border-b border-border/70 flex items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/50 text-xs">
          <button
            onClick={() => onModeChange('preview')}
            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
              mode === 'preview'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => onModeChange('details')}
            className={`px-2.5 py-1 rounded-md font-medium transition-all ${
              mode === 'details'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Details
          </button>
        </div>

        <div className="flex items-center gap-1">
          {selectedItem && !selectedItem.isDirectory && (
            <Button
              variant="ghost" size="icon-xs"
              onClick={() => onOpenModal(selectedItem)}
              title="Open full-screen preview"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon-xs"
            onClick={onClose}
            title="Close pane"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── Content Area ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {!selectedItem ? (
          /* Empty State */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-muted-foreground my-auto">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 border border-border/60 flex items-center justify-center mb-3 text-muted-foreground/60">
              <Eye className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">Select a file to preview</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Click any item from the file browser to instantly render its live stream preview and metadata.
            </p>
          </div>

        ) : mode === 'preview' ? (
          /* ── Preview Mode ─────────────────────────────────────────── */
          <div className="flex flex-col gap-3">
            {/* Item header */}
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-muted/60 shrink-0">
                {getCategoryIcon(selectedItem)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground truncate" title={selectedItem.name}>
                  {selectedItem.name}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">
                  {selectedItem.isDirectory ? 'Folder' : formatBytes(selectedItem.sizeBytes)}
                </p>
              </div>
            </div>

            {/* ── Per-type preview ──────────────────────────────────── */}
            {selectedItem.isDirectory ? (
              <FolderCard item={selectedItem} onNavigateFolder={onNavigateFolder} />

            ) : selectedItem.category === 'image' ? (
              <SideImagePreview
                key={selectedItem.path}
                streamUrl={streamUrl}
                item={selectedItem}
                imgZoom={imgZoom}
                setImgZoom={setImgZoom}
                onDownload={() => onDownload(selectedItem)}
              />

            ) : selectedItem.category === 'video' ? (
              <SideVideoPreview
                key={selectedItem.path}
                streamUrl={streamUrl}
                videoMime={videoMime}
                item={selectedItem}
                onDownload={() => onDownload(selectedItem)}
              />

            ) : selectedItem.category === 'audio' ? (
              <SideAudioPreview
                key={selectedItem.path}
                streamUrl={streamUrl}
                audioMime={audioMime}
                item={selectedItem}
                onDownload={() => onDownload(selectedItem)}
              />

            ) : selectedItem.extension === 'pdf' ? (
              <div className="w-full h-72 rounded-xl overflow-hidden border border-border/60 bg-card">
                <iframe
                  src={`${streamUrl}#toolbar=0`}
                  className="w-full h-full border-none"
                  title={selectedItem.name}
                />
              </div>

            ) : selectedItem.category === 'code' ||
              ['txt', 'md', 'json', 'log', 'csv', 'yaml', 'yml', 'xml', 'ini', 'env', 'conf', 'service'].includes(selectedItem.extension || '') ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground pb-1 border-b">
                  <span className="uppercase font-mono">{selectedItem.extension || 'TEXT'} Preview</span>
                  <span className="font-mono">First {Math.round(TEXT_PREVIEW_BYTES / 1024)} KB</span>
                </div>
                <SideTextPreview
                  key={selectedItem.path}
                  url={streamUrl}
                  filename={selectedItem.name}
                  ext={selectedItem.extension || 'txt'}
                  onDownload={() => onDownload(selectedItem)}
                />
              </div>

            ) : (
              <BinaryFallback item={selectedItem} onDownload={() => onDownload(selectedItem)} />
            )}
          </div>

        ) : (
          /* ── Details Mode ─────────────────────────────────────────── */
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2.5 pb-3 border-b border-border/60">
              <div className="p-2 rounded-lg bg-muted/60 shrink-0">
                {getCategoryIcon(selectedItem)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground break-words" title={selectedItem.name}>
                  {selectedItem.name}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                  {selectedItem.isDirectory
                    ? 'File folder'
                    : `${(selectedItem.extension || 'FILE').toUpperCase()} File`}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  File Details
                </span>
                <div className="bg-muted/30 rounded-lg p-2.5 border border-border/50 space-y-2">
                  <DetailRow label="Type" value={(selectedItem.extension || (selectedItem.isDirectory ? 'Directory' : 'File')).toUpperCase()} />
                  <DetailRow label="Size" value={`${formatBytes(selectedItem.sizeBytes)} (${selectedItem.sizeBytes.toLocaleString()} bytes)`} mono />
                  <DetailRow label="Category" value={selectedItem.category} capitalize />
                  <DetailRow label="Modified" value={new Date(selectedItem.modifiedAt).toLocaleString()} mono />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Storage Path
                </span>
                <div className="bg-muted/30 rounded-lg p-2.5 border border-border/50 space-y-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">Logical Path:</span>
                    <span className="font-mono text-foreground break-all select-all">{selectedItem.path}</span>
                  </div>
                  {selectedItem.physicalMountPath && (
                    <div>
                      <span className="text-muted-foreground block text-[10px]">Physical Storage:</span>
                      <span className="font-mono text-foreground break-all select-all">{selectedItem.physicalMountPath}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-1 border-t border-border/40">
                    <span className="text-muted-foreground">Drive Pool</span>
                    <Badge variant="outline" className="font-mono text-[10px] bg-primary/5 text-primary border-primary/20">
                      Drive {selectedItem.physicalDiskLetter || 'D'}:
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Actions ──────────────────────────────────────────── */}
      {selectedItem && (
        <div className="p-3 border-t border-border/70 bg-muted/30 flex items-center justify-between gap-1.5">
          {!selectedItem.isDirectory && (
            <Button
              variant="outline" size="xs"
              onClick={() => onOpenModal(selectedItem)}
              className="flex-1 gap-1 text-[11px] h-8"
              title="Full screen preview"
            >
              <Eye className="w-3.5 h-3.5" />
              Full Preview
            </Button>
          )}
          <Button
            variant="outline" size="xs"
            onClick={() => onDownload(selectedItem)}
            className="flex-1 gap-1 text-[11px] h-8"
            title="Download file"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </Button>
          <Button
            variant="outline" size="xs"
            onClick={() => onShare(selectedItem)}
            className="flex-1 gap-1 text-[11px] h-8"
            title="Create share link"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
          </Button>
        </div>
      )}
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function DetailRow({ label, value, mono, capitalize }: { label: string; value: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <div className="flex justify-between items-center text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

function FolderCard({ item, onNavigateFolder }: { item: FileItem; onNavigateFolder?: (path: string) => void }) {
  return (
    <div className="p-6 rounded-xl border border-border/60 bg-muted/20 text-center flex flex-col items-center my-4">
      <Folder className="w-14 h-14 text-primary fill-primary/20 mb-3" />
      <h5 className="font-semibold text-xs text-foreground">{item.name}</h5>
      <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{item.path}</p>
      {onNavigateFolder && (
        <Button
          size="sm" variant="outline"
          onClick={() => onNavigateFolder(item.path)}
          className="mt-4 text-xs gap-1.5 h-8"
        >
          Open Folder
        </Button>
      )}
    </div>
  );
}

function BinaryFallback({ item, onDownload }: { item: FileItem; onDownload: () => void }) {
  return (
    <div className="p-6 rounded-xl border border-border/60 bg-muted/20 text-center flex flex-col items-center">
      <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
        <FileQuestion className="w-6 h-6" />
      </div>
      <h5 className="font-semibold text-xs text-foreground truncate max-w-[200px]">{item.name}</h5>
      <p className="text-[11px] text-muted-foreground mt-1">Preview not supported for this file type.</p>
      <Button size="sm" onClick={onDownload} className="mt-4 gap-1.5 text-xs h-8">
        <Download className="w-3.5 h-3.5" />
        Download File
      </Button>
    </div>
  );
}

function SidePaneErrorCard({
  title, message, is403, onRetry, onDownload,
}: {
  title: string; message: string; is403?: boolean;
  onRetry: () => void; onDownload: () => void;
}) {
  return (
    <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/5 text-center flex flex-col items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${is403 ? 'bg-amber-500/10 text-amber-500' : 'bg-destructive/10 text-destructive'}`}>
        {is403 ? <ShieldAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
      </div>
      <div>
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{message}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="xs" onClick={onRetry} className="gap-1 text-[11px] h-7">
          <RefreshCw className="w-3 h-3" /> Retry
        </Button>
        {!is403 && (
          <Button size="xs" onClick={onDownload} className="gap-1 text-[11px] h-7">
            <Download className="w-3 h-3" /> Download
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Side Image Preview ─────────────────────────────────────────────────────
function SideImagePreview({
  streamUrl, item, imgZoom, setImgZoom, onDownload,
}: {
  streamUrl: string; item: FileItem;
  imgZoom: number; setImgZoom: React.Dispatch<React.SetStateAction<number>>;
  onDownload: () => void;
}) {
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  if (error) {
    return (
      <SidePaneErrorCard
        title="Image Preview Unavailable"
        message="This image could not be decoded. It may be corrupted or in an unsupported format."
        onRetry={() => { setError(false); setRetryKey((k) => k + 1); }}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="xs" onClick={() => setImgZoom((z) => Math.max(0.25, z - 0.25))} className="h-6 w-6 p-0">
            <ZoomOut className="w-3 h-3" />
          </Button>
          <span className="text-[11px] font-mono w-10 text-center">{Math.round(imgZoom * 100)}%</span>
          <Button variant="outline" size="xs" onClick={() => setImgZoom((z) => Math.min(3, z + 0.25))} className="h-6 w-6 p-0">
            <ZoomIn className="w-3 h-3" />
          </Button>
        </div>
        <Button variant="ghost" size="xs" onClick={() => setImgZoom(1)} className="h-6 px-1.5 text-[11px]">
          <RotateCcw className="w-3 h-3 mr-1" /> Reset
        </Button>
      </div>
      <div className="w-full aspect-square rounded-xl overflow-hidden bg-[repeating-conic-gradient(#88888815_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] border border-border/60 flex items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={streamUrl}
          alt={item.name}
          key={`side-img-${retryKey}`}
          style={{ transform: `scale(${imgZoom})`, transformOrigin: 'center', transition: 'transform 0.15s ease' }}
          className="max-w-full max-h-full object-contain rounded-md"
          onError={() => setError(true)}
        />
      </div>
    </div>
  );
}

// ── Side Video Preview ─────────────────────────────────────────────────────
function SideVideoPreview({
  streamUrl, videoMime, item, onDownload,
}: {
  streamUrl: string; videoMime: string; item: FileItem; onDownload: () => void;
}) {
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  if (error) {
    return (
      <SidePaneErrorCard
        title="Video Playback Failed"
        message="This video could not be decoded. The codec may be unsupported or the file is corrupted."
        onRetry={() => { setError(false); setRetryKey((k) => k + 1); }}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="w-full aspect-video bg-black/90 rounded-xl overflow-hidden shadow-inner border border-border/60">
        <video
          controls
          preload="metadata"
          className="w-full h-full object-contain"
          key={`side-video-${retryKey}`}
          onError={() => setError(true)}
        >
          <source src={streamUrl} type={videoMime} />
          Your browser does not support HTML5 video streaming.
        </video>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono px-1">
        <span>Native Range Seek</span>
        <Badge variant="outline" className="text-[9px] py-0 px-1">HTTP 206</Badge>
      </div>
    </div>
  );
}

// ── Side Audio Preview ─────────────────────────────────────────────────────
function SideAudioPreview({
  streamUrl, audioMime, item, onDownload,
}: {
  streamUrl: string; audioMime: string; item: FileItem; onDownload: () => void;
}) {
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  if (error) {
    return (
      <SidePaneErrorCard
        title="Audio Playback Failed"
        message="This audio file could not be decoded. The codec may not be supported by this browser."
        onRetry={() => { setError(false); setRetryKey((k) => k + 1); }}
        onDownload={onDownload}
      />
    );
  }

  return (
    <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
        <Music className="w-7 h-7" />
      </div>
      <audio
        controls
        className="w-full h-8"
        key={`side-audio-${retryKey}`}
        onError={() => setError(true)}
      >
        <source src={streamUrl} type={audioMime} />
        Your browser does not support HTML5 audio.
      </audio>
    </div>
  );
}

// ── Side Text Preview ──────────────────────────────────────────────────────
function SideTextPreview({
  url, filename, ext, onDownload,
}: {
  url: string; filename: string; ext: string; onDownload: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<{ status: number } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent(null);
    setFetchError(null);

    fetch(url, { headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` } })
      .then(async (r) => {
        if (!r.ok && r.status !== 206 && r.status !== 200) {
          throw { status: r.status };
        }
        return r.text();
      })
      .then((text) => {
        if (!cancelled) { setContent(text.slice(0, TEXT_PREVIEW_BYTES)); setLoading(false); }
      })
      .catch((err: any) => {
        if (!cancelled) { setFetchError({ status: err?.status ?? 0 }); setLoading(false); }
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
      <div className="h-44 rounded-lg bg-muted/40 animate-pulse border border-border/50 flex items-center justify-center text-xs text-muted-foreground font-mono">
        Streaming preview...
      </div>
    );
  }

  if (fetchError) {
    const is403 = fetchError.status === 403;
    const is404 = fetchError.status === 404;
    return (
      <SidePaneErrorCard
        title={is403 ? 'Access Denied' : is404 ? 'File Not Found' : 'Preview Unavailable'}
        message={
          is403
            ? 'You do not have read permissions for this item.'
            : is404
            ? 'This file could not be found on physical storage.'
            : 'The preview stream could not be loaded.'
        }
        is403={is403}
        onRetry={() => setRetryKey((k) => k + 1)}
        onDownload={onDownload}
      />
    );
  }

  const lines = (content ?? '').split('\n');

  return (
    <div className="rounded-lg border border-border/60 bg-muted/40 overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border/50">
        <span className="font-mono text-[10px] text-muted-foreground uppercase">{ext} • {lines.length} lines</span>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-background/70 hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
          title="Copy to clipboard"
        >
          {copied ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Line-numbered content */}
      <div className="overflow-auto max-h-64">
        <table className="w-full text-[11px] font-mono leading-relaxed border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="group hover:bg-primary/5">
                <td className="select-none text-right pr-3 pl-2 py-0 text-muted-foreground/40 border-r border-border/30 w-8 shrink-0 text-[10px]">
                  {i + 1}
                </td>
                <td className="pl-3 pr-2 py-0 text-foreground/85 whitespace-pre-wrap break-all">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
