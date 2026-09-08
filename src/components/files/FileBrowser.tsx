'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense, useTransition } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { FileItem, FileCategory, UserRole } from '@/lib/types';
import { validatePathAccess } from '@/lib/rbac/path-validator';
import {
  readDirectoryContents,
  createPhysicalDirectory,
  archiveFileAction,
} from '@/lib/actions/files';
import { checkQuota } from '@/lib/actions/quota';
import { MediaPreviewModal } from '@/components/files/MediaPreviewModal';
import { SidePreviewPane } from '@/components/files/SidePreviewPane';
import { CreateShareModal } from '@/components/shares/CreateShareModal';
import { ChunkUploadModal } from '@/components/upload/ChunkUploadModal';
import { UploadProgressWidget, UploadItem } from '@/components/upload/UploadProgressWidget';
import { UploadErrorDialog, UploadErrorInfo } from '@/components/upload/UploadErrorDialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Folder,
  File,
  Film,
  Image as ImageIcon,
  Music,
  Code,
  FileText,
  Archive,
  LayoutGrid,
  Grid,
  Grid2X2,
  Square,
  List,
  TableProperties,
  UploadCloud,
  FolderPlus,
  Share2,
  Trash2,
  MoreVertical,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  HardDrive,
  Eye,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Upload,
  AlertTriangle,
  SlidersHorizontal,
  PanelRight,
  Info,
  Check,
  Download,
  Loader2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ViewMode = 'extra-large' | 'large' | 'medium' | 'small' | 'list' | 'details';

interface FileBrowserProps {
  initialPath?: string;
  scopeToShared?: boolean;
}

function FileBrowserInner({ initialPath, scopeToShared = false }: FileBrowserProps) {
  const { currentUser, userPermissions, isSuperadmin, isAdmin } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Determine starting path: prioritize URL query ?path=, then initialPath
  const startingPath = useMemo(() => {
    const urlPath = searchParams?.get('path');
    if (urlPath && urlPath.trim()) return urlPath.trim();
    if (initialPath) return initialPath;
    if (scopeToShared) return '/shared';
    return '/';
  }, [searchParams, initialPath, scopeToShared]);

  const [currentPath, setCurrentPath] = useState<string>(startingPath);
  const [physicalPath, setPhysicalPath] = useState<string>('');
  const [storageDrive, setStorageDrive] = useState<string>('D');
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([
    { name: 'Home', path: '/' },
  ]);

  const [files, setFiles] = useState<FileItem[]>([]);
  // isPending from useTransition drives the loading spinner — the existing file
  // list stays visible while loading so there's no blank-screen flash
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Layout & Panes state
  const [viewMode, setViewMode] = useState<ViewMode>('large');
  const [previewPaneOpen, setPreviewPaneOpen] = useState<boolean>(false);
  const [detailsPaneOpen, setDetailsPaneOpen] = useState<boolean>(false);
  const [paneMode, setPaneMode] = useState<'preview' | 'details'>('preview');

  // Selected item state for side preview pane
  const [selectedItem, setSelectedItem] = useState<FileItem | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals state
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Direct fast upload ref & real-time multi-file upload queue
  const directFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingDirect, setIsUploadingDirect] = useState(false);

  // Global Error Dialog state for batch and direct uploads
  const [globalUploadErrorInfo, setGlobalUploadErrorInfo] = useState<UploadErrorInfo | null>(null);
  const [isGlobalUploadErrorOpen, setIsGlobalUploadErrorOpen] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isUploadWidgetOpen, setIsUploadWidgetOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Restore persistent View Mode & Panes preferences from localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    try {
      const savedMode =
        localStorage.getItem(`homelab_view_mode_${currentUser.id}`) ||
        localStorage.getItem('homelab_view_mode');
      if (
        savedMode &&
        ['extra-large', 'large', 'medium', 'small', 'list', 'details'].includes(savedMode)
      ) {
        setViewMode(savedMode as ViewMode);
      }

      const savedPreview = localStorage.getItem(`homelab_preview_pane_${currentUser.id}`);
      if (savedPreview !== null) {
        const isOpen = savedPreview === 'true';
        setPreviewPaneOpen(isOpen);
        if (isOpen) setPaneMode('preview');
      }

      const savedDetails = localStorage.getItem(`homelab_details_pane_${currentUser.id}`);
      if (savedDetails !== null) {
        const isOpen = savedDetails === 'true';
        setDetailsPaneOpen(isOpen);
        if (isOpen && savedPreview !== 'true') setPaneMode('details');
      }
    } catch {}
  }, [currentUser?.id]);

  // View Mode change handler with localStorage persistence
  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      if (currentUser) {
        localStorage.setItem(`homelab_view_mode_${currentUser.id}`, mode);
      }
      localStorage.setItem('homelab_view_mode', mode);
    } catch {}
  };

  // Preview Pane toggle handler
  const handleTogglePreviewPane = () => {
    setPreviewPaneOpen((prev) => {
      const next = !prev;
      try {
        if (currentUser) {
          localStorage.setItem(`homelab_preview_pane_${currentUser.id}`, String(next));
        }
      } catch {}
      if (next) {
        setPaneMode('preview');
      }
      return next;
    });
  };

  // Details Pane toggle handler
  const handleToggleDetailsPane = () => {
    setDetailsPaneOpen((prev) => {
      const next = !prev;
      try {
        if (currentUser) {
          localStorage.setItem(`homelab_details_pane_${currentUser.id}`, String(next));
        }
      } catch {}
      if (next) {
        setPaneMode('details');
      }
      return next;
    });
  };

  // 1. RBAC Path Validation Check
  const accessCheck = useMemo(() => {
    if (!currentUser) return { allowed: false, reason: 'Unauthenticated' };
    return validatePathAccess(currentUser, currentPath, 'read', userPermissions);
  }, [currentUser, currentPath, userPermissions]);

  // Load Real Directory Contents from Physical Storage
  const loadDirectory = (targetPath: string) => {
    if (!currentUser) return;
    setIsLoading(true);
    startTransition(async () => {
      try {
        const res = await readDirectoryContents(targetPath, currentUser.id);
        if (res.success) {
          setFiles(res.items);
          setPhysicalPath(res.physicalPath);
          setStorageDrive(res.storageDrive);
          setBreadcrumbs(res.breadcrumbs);

          // Keep selection synced if item still exists in new listing
          setSelectedItem((prev) => {
            if (!prev) return null;
            return res.items.find((item) => item.path === prev.path) || null;
          });
        } else {
          showNotification('error', res.error || 'Failed to read directory.');
        }
      } catch (err: any) {
        console.error('Error loading directory:', err);
        showNotification('error', err?.message || 'Failed to inspect filesystem.');
      } finally {
        setIsLoading(false);
      }
    });
  };

  // Sync with currentPath and currentUser changes
  useEffect(() => {
    if (currentUser) {
      loadDirectory(currentPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, currentUser?.id]);

  // Update navigation path and push state to URL search params
  const navigateTo = (newPath: string) => {
    if (!currentUser) return;
    const clean = newPath || '/';
    const check = validatePathAccess(currentUser, clean, 'read', userPermissions);
    if (!check.allowed && !isSuperadmin) {
      showNotification('error', check.reason || 'Access denied to this folder.');
      return;
    }

    setSelectedItem(null);
    setCurrentPath(clean);
    try {
      const params = new URLSearchParams(window.location.search);
      if (clean === '/' || !clean) {
        params.delete('path');
      } else {
        params.set('path', clean);
      }
      const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.pushState(null, '', newUrl);
    } catch {}
  };

  // Direct file download trigger
  const handleDownloadFile = (file: FileItem) => {
    const a = document.createElement('a');
    a.href = `/api/download?path=${encodeURIComponent(file.path.replace(/^\/+/, ''))}`;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Single-Click Item: Selects item and immediately updates the Side Preview Pane
  const handleItemClick = (item: FileItem) => {
    setSelectedItem(item);
  };

  // Double-Click Item:
  // - Folders: Navigate into directory
  // - Previewable Media/Code/Docs: Opens full-screen preview modal
  // - Other files: Starts direct file download
  const handleItemDoubleClick = (item: FileItem) => {
    if (item.isDirectory) {
      navigateTo(item.path);
    } else {
      if (
        ['video', 'image', 'audio', 'code'].includes(item.category) ||
        item.extension === 'pdf' ||
        item.category === 'document'
      ) {
        setPreviewFile(item);
        setPreviewOpen(true);
      } else {
        handleDownloadFile(item);
      }
    }
  };

  // Navigate Up one level
  const navigateUp = () => {
    if (currentPath === '/' || !currentPath) return;
    const lastSlash = currentPath.lastIndexOf('/');
    if (lastSlash > 0) {
      navigateTo(currentPath.substring(0, lastSlash));
    } else {
      navigateTo('/');
    }
  };

  // Create Physical Directory on Disk
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentUser) return;
    setIsCreatingFolder(true);
    try {
      const res = await createPhysicalDirectory(currentPath, newFolderName.trim(), currentUser.id);
      if (res.success) {
        showNotification('success', `Created folder "${newFolderName.trim()}" on physical disk.`);
        setNewFolderName('');
        setNewFolderOpen(false);
        await loadDirectory(currentPath);
      } else {
        showNotification('error', res.error || 'Failed to create folder.');
      }
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to create directory.');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // Delete / Move to Archive
  const handleDeleteItem = async (item: FileItem) => {
    if (!currentUser) return;
    const itemType = item.isDirectory ? 'folder' : 'file';
    if (
      !confirm(
        `Move ${itemType} "${item.name}" to the Archive storage pool?\n\n${
          item.isDirectory ? 'All contents inside this folder will also be archived.' : ''
        }`
      )
    ) {
      return;
    }
    try {
      const res = await archiveFileAction(currentPath, item.name, currentUser.id);
      if (res.success) {
        showNotification('success', `"${item.name}" (${itemType}) archived to storage pool.`);
        if (selectedItem?.path === item.path) {
          setSelectedItem(null);
        }
        await loadDirectory(currentPath);
      } else {
        showNotification('error', res.error || `Failed to archive ${itemType}.`);
      }
    } catch (err: any) {
      showNotification('error', err?.message || `Failed to archive ${itemType}.`);
    }
  };

  // ── Multi-File Upload & Real-Time Progress Engine ────────────────────────
  const uploadSingleFileWithProgress = (item: UploadItem): Promise<void> => {
    return new Promise((resolve) => {
      if (!currentUser) {
        resolve();
        return;
      }
      const CHUNK_THRESHOLD = 10 * 1024 * 1024; // 10 MB: larger files use chunked upload engine

      // If file is large (>10MB), stream through Chunked Upload Engine to avoid Node monolithic FormData buffer limits
      if (item.file.size > CHUNK_THRESHOLD) {
        const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks
        const totalChunks = Math.ceil(item.file.size / CHUNK_SIZE);
        const uploadId = `up-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const abortCtrl = new AbortController();
        const startTime = Date.now();
        let bytesUploadedSoFar = 0;

        setUploadItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, status: 'uploading', abortController: abortCtrl, progress: 0 } : i
          )
        );

        (async () => {
          try {
            for (let idx = 0; idx < totalChunks; idx++) {
              if (abortCtrl.signal.aborted) {
                throw new Error('Upload cancelled');
              }

              const start = idx * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, item.file.size);
              const chunkBlob = item.file.slice(start, end);

              const fd = new FormData();
              fd.append('uploadId', uploadId);
              fd.append('chunkIndex', idx.toString());
              fd.append('chunk', chunkBlob, item.file.name);
              fd.append('userId', currentUser.id);

              const res = await fetch('/api/upload/chunk', {
                method: 'POST',
                body: fd,
                signal: abortCtrl.signal,
              });

              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (res.status === 403 || errData.code === 'QUOTA_EXCEEDED') {
                  setGlobalUploadErrorInfo({
                    type: 'storage_full',
                    title: 'Storage Space Exceeded',
                    message: errData.formattedMessage || errData.error || 'Storage Quota Exceeded',
                    requiredBytes: errData.requiredBytes || item.file.size,
                    remainingBytes: errData.remainingBytes,
                    quotaBytes: errData.quotaBytes,
                    fileName: item.name,
                  });
                  setIsGlobalUploadErrorOpen(true);
                  throw new Error(errData.error || 'Storage Quota Exceeded');
                }
                if (res.status === 507 || errData.code === 'DISK_FULL') {
                  setGlobalUploadErrorInfo({
                    type: 'server_error',
                    title: 'Upload Failed',
                    message: errData.error || 'Target storage drive is low on physical disk space.',
                    fileName: item.name,
                    onRetry: () => handleRetryUploadItem(item.id),
                  });
                  setIsGlobalUploadErrorOpen(true);
                  throw new Error(errData.error || 'Staging drive full');
                }
                throw new Error(errData.error || `Chunk ${idx} upload failed with status ${res.status}`);
              }

              bytesUploadedSoFar += (end - start);
              const percent = Math.min(99, Math.round((bytesUploadedSoFar / item.file.size) * 100));
              const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
              const speedMBs = (bytesUploadedSoFar / 1048576 / elapsed).toFixed(1);

              setUploadItems((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? { ...i, progress: percent, speed: `${speedMBs} MB/s` }
                    : i
                )
              );
            }

            // All chunks sent, assemble now on target physical storage disk
            setUploadItems((prev) =>
              prev.map((i) => (i.id === item.id ? { ...i, speed: 'Assembling on disk...' } : i))
            );

            const assembleRes = await fetch('/api/upload/assemble', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uploadId,
                totalChunks,
                destinationPath: physicalPath || currentPath,
                filename: item.file.name,
                userId: currentUser.id,
              }),
              signal: abortCtrl.signal,
            });

            const assembleData = await assembleRes.json().catch(() => ({}));
            if (!assembleRes.ok || !assembleData.success) {
              if (assembleRes.status === 403 || assembleData.code === 'QUOTA_EXCEEDED') {
                setGlobalUploadErrorInfo({
                  type: 'storage_full',
                  title: 'Storage Space Exceeded',
                  message: assembleData.formattedMessage || assembleData.error,
                  requiredBytes: assembleData.requiredBytes || item.file.size,
                  remainingBytes: assembleData.remainingBytes,
                  quotaBytes: assembleData.quotaBytes,
                  fileName: item.name,
                });
                setIsGlobalUploadErrorOpen(true);
              }
              throw new Error(assembleData.error || 'File assembly failed on physical storage');
            }

            setUploadItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? { ...i, progress: 100, status: 'completed', speed: undefined }
                  : i
              )
            );
            resolve();
          } catch (chunkErr: any) {
            const isCancelled = abortCtrl.signal.aborted || chunkErr?.message === 'Upload cancelled';
            const isNetLoss =
              !isCancelled &&
              (!navigator.onLine ||
                chunkErr instanceof TypeError ||
                chunkErr?.message?.toLowerCase().includes('network') ||
                chunkErr?.message?.toLowerCase().includes('fetch'));

            if (isNetLoss) {
              setGlobalUploadErrorInfo({
                type: 'network_error',
                title: 'Upload Interrupted',
                message: 'Network connection lost during upload. Please check your internet connection and try again.',
                fileName: item.name,
                onRetry: () => handleRetryUploadItem(item.id),
              });
              setIsGlobalUploadErrorOpen(true);
            }

            setUploadItems((prev) =>
              prev.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: 'error',
                      error: isCancelled ? 'Upload cancelled' : (chunkErr?.message || 'Upload failed'),
                    }
                  : i
              )
            );
            resolve();
          }
        })();
        return;
      }

      // For smaller files (<=10MB), use fast direct multipart streaming
      const xhr = new XMLHttpRequest();
      const startTime = Date.now();
      let lastLoaded = 0;
      let lastTime = startTime;

      setUploadItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading', xhr } : i))
      );

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          const now = Date.now();
          const timeDelta = (now - lastTime) / 1000;
          let speedStr = '';
          if (timeDelta > 0.3) {
            const bytesDelta = event.loaded - lastLoaded;
            const bytesPerSec = bytesDelta / Math.max(timeDelta, 0.001);
            if (bytesPerSec >= 1_048_576) {
              speedStr = `${(bytesPerSec / 1_048_576).toFixed(1)} MB/s`;
            } else if (bytesPerSec >= 1024) {
              speedStr = `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
            }
            lastLoaded = event.loaded;
            lastTime = now;
          }

          setUploadItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    progress: percent,
                    speed: speedStr || i.speed,
                  }
                : i
            )
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            if (res.success !== false) {
              setUploadItems((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? { ...i, progress: 100, status: 'completed', speed: undefined }
                    : i
                )
              );
              resolve();
              return;
            } else {
              setUploadItems((prev) =>
                prev.map((i) =>
                  i.id === item.id
                    ? { ...i, status: 'error', error: res.error || 'Upload failed' }
                    : i
                )
              );
              resolve();
              return;
            }
          } catch {
            setUploadItems((prev) =>
              prev.map((i) =>
                i.id === item.id ? { ...i, progress: 100, status: 'completed' } : i
              )
            );
            resolve();
            return;
          }
        } else {
          let errMessage = 'Upload failed';
          try {
            const res = JSON.parse(xhr.responseText);
            errMessage = res.error || errMessage;
            if (xhr.status === 403 || res.code === 'QUOTA_EXCEEDED') {
              setGlobalUploadErrorInfo({
                type: 'storage_full',
                title: 'Storage Space Exceeded',
                message: res.formattedMessage || res.error || 'Storage Quota Exceeded',
                requiredBytes: res.requiredBytes || item.size,
                remainingBytes: res.remainingBytes,
                quotaBytes: res.quotaBytes,
                fileName: item.name,
              });
              setIsGlobalUploadErrorOpen(true);
            }
          } catch {}
          setUploadItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, status: 'error', error: errMessage } : i
            )
          );
          resolve();
        }
      };

      xhr.onerror = () => {
        setUploadItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error', error: 'Network connection failed' }
              : i
          )
        );
        setGlobalUploadErrorInfo({
          type: 'network_error',
          title: 'Upload Interrupted',
          message:
            'Network connection lost during upload. Please check your internet connection and try again.',
          fileName: item.name,
          onRetry: () => handleRetryUploadItem(item.id),
        });
        setIsGlobalUploadErrorOpen(true);
        resolve();
      };

      xhr.onabort = () => {
        setUploadItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: 'error', error: 'Upload cancelled' }
              : i
          )
        );
        resolve();
      };

      const formData = new FormData();
      formData.append('files', item.file);
      formData.append('destinationPath', physicalPath || currentPath);
      formData.append('userId', currentUser.id);

      xhr.open('POST', '/api/files/upload');
      xhr.send(formData);
    });
  };

  // Upload multiple files with quota pre-check and concurrency queue
  const handleUploadFiles = async (filesList: File[]) => {
    if (!filesList || filesList.length === 0 || !currentUser) return;

    // Check user quota before proceeding
    const totalBytes = filesList.reduce((acc, f) => acc + f.size, 0);
    const quotaCheck = await checkQuota(currentUser.id, totalBytes);
    if (!quotaCheck.allowed) {
      setGlobalUploadErrorInfo({
        type: 'storage_full',
        title: 'Storage Space Exceeded',
        message: quotaCheck.formattedMessage || quotaCheck.error,
        requiredBytes: quotaCheck.requiredBytes || totalBytes,
        remainingBytes: quotaCheck.remainingBytes,
        quotaBytes: quotaCheck.quotaBytes,
        usedBytes: quotaCheck.usedBytes,
        fileName:
          filesList.length === 1
            ? filesList[0].name
            : `${filesList.length} files (${(totalBytes / (1024 * 1024)).toFixed(1)} MB)`,
      });
      setIsGlobalUploadErrorOpen(true);
      showNotification('error', quotaCheck.error || 'Storage Quota Exceeded');
      return;
    }

    const newItems: UploadItem[] = filesList.map((file) => ({
      id: `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'queued',
    }));

    setUploadItems((prev) => [...newItems, ...prev]);
    setIsUploadWidgetOpen(true);
    setIsUploadingDirect(true);

    try {
      // Execute uploads with concurrency of 2
      const queue = [...newItems];
      const activeWorkers: Promise<void>[] = [];
      const CONCURRENCY = 2;

      const runWorker = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            await uploadSingleFileWithProgress(item);
          }
        }
      };

      for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
        activeWorkers.push(runWorker());
      }

      await Promise.all(activeWorkers);
      showNotification('success', `Uploaded ${filesList.length} file${filesList.length > 1 ? 's' : ''} successfully.`);
      await loadDirectory(currentPath);
    } catch (err: any) {
      showNotification('error', err?.message || 'Upload batch encountered errors.');
    } finally {
      setIsUploadingDirect(false);
      if (directFileInputRef.current) directFileInputRef.current.value = '';
    }
  };

  const handleDirectFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files);
      handleUploadFiles(selectedFiles);
    }
    if (directFileInputRef.current) directFileInputRef.current.value = '';
  };

  const handleCancelUploadItem = (id: string) => {
    setUploadItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.xhr) {
        item.xhr.abort();
      }
      return prev.map((i) => (i.id === id ? { ...i, status: 'error', error: 'Cancelled' } : i));
    });
  };

  const handleRetryUploadItem = async (id: string) => {
    const item = uploadItems.find((i) => i.id === id);
    if (!item) return;
    await uploadSingleFileWithProgress(item);
    await loadDirectory(currentPath);
  };

  // Drag and Drop event handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      handleUploadFiles(droppedFiles);
    }
  };

  // Format File Size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '--';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const getFileIcon = (item: FileItem, sizeClass: string = 'w-5 h-5') => {
    if (item.isDirectory)
      return <Folder className={`${sizeClass} text-primary fill-primary/20 shrink-0`} />;
    switch (item.category) {
      case 'video':
        return <Film className={`${sizeClass} text-indigo-500 shrink-0`} />;
      case 'image':
        return <ImageIcon className={`${sizeClass} text-sky-500 shrink-0`} />;
      case 'audio':
        return <Music className={`${sizeClass} text-emerald-500 shrink-0`} />;
      case 'code':
        return <Code className={`${sizeClass} text-amber-500 shrink-0`} />;
      case 'archive':
        return <Archive className={`${sizeClass} text-purple-500 shrink-0`} />;
      default:
        return <FileText className={`${sizeClass} text-muted-foreground shrink-0`} />;
    }
  };

  // Filter items based on search and category
  const displayedItems = useMemo(() => {
    return files.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === 'all' ||
        (selectedCategory === 'folders' && item.isDirectory) ||
        (!item.isDirectory && item.category === selectedCategory);
      return matchesSearch && matchesCategory;
    });
  }, [files, searchQuery, selectedCategory]);

  const isSidePaneVisible = previewPaneOpen || detailsPaneOpen;

  if (!currentUser) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3 text-muted-foreground animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Verifying credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-4 relative min-h-[500px]"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Visual Drag and Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 border-4 border-dashed border-primary/60 pointer-events-none animate-in fade-in-0 duration-150">
          <div className="p-6 rounded-3xl bg-primary/10 text-primary mb-4 animate-bounce">
            <UploadCloud className="w-16 h-16" />
          </div>
          <h3 className="text-2xl font-bold tracking-tight text-foreground">
            Drop files here to upload
          </h3>
          <p className="text-sm text-muted-foreground mt-2 font-mono">
            Destination folder: {currentPath || '/'}
          </p>
        </div>
      )}
      {/* Notifications */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 animate-in fade-in-0 duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* 403 Access Denied Fallback */}
      {!accessCheck.allowed && !isSuperadmin ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center max-w-xl mx-auto my-12">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-foreground">403 Forbidden: Access Denied</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            {accessCheck.reason || 'You do not have permission to browse this directory.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              onClick={() => {
                const safeHome =
                  !isSuperadmin && !isAdmin && currentUser?.home_directory_path
                    ? currentUser.home_directory_path
                    : '/';
                navigateTo(safeHome);
              }}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Safe Home Folder
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Top Control Bar: Breadcrumbs, Physical Path, & Actions */}
          <div className="flex flex-col gap-3 bg-card/60 backdrop-blur-md p-4 rounded-xl border border-border/70 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Breadcrumb Path Navigator */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-sm font-medium">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={navigateUp}
                  disabled={currentPath === '/' || !currentPath}
                  className="h-7 w-7 p-0 shrink-0"
                  title="Navigate Up (Alt + Up)"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>

                {/* Desktop Breadcrumbs: full path */}
                <div className="hidden md:flex items-center gap-1 shrink-0 font-mono text-xs">
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.path}>
                      {idx > 0 && (
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <button
                        onClick={() => navigateTo(crumb.path)}
                        className={`px-2 py-1 rounded-md transition-colors ${
                          idx === breadcrumbs.length - 1
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                {/* Mobile Breadcrumbs: Auto-collapse deep paths to ... / [Parent] / [Current Folder] */}
                <div className="flex md:hidden items-center gap-1 shrink-0 font-mono text-xs">
                  {breadcrumbs.length <= 2 ? (
                    breadcrumbs.map((crumb, idx) => (
                      <React.Fragment key={crumb.path}>
                        {idx > 0 && (
                          <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                        )}
                        <button
                          onClick={() => navigateTo(crumb.path)}
                          className={`px-1.5 py-1 rounded-md transition-colors max-w-[100px] truncate ${
                            idx === breadcrumbs.length - 1
                              ? 'bg-primary/10 text-primary font-semibold'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          {crumb.name}
                        </button>
                      </React.Fragment>
                    ))
                  ) : (
                    <>
                      {/* Ancestor dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger className="px-1.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted font-bold cursor-pointer">
                          ...
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48 text-xs">
                          {breadcrumbs.slice(0, -2).map((crumb) => (
                            <DropdownMenuItem
                              key={crumb.path}
                              onClick={() => navigateTo(crumb.path)}
                              className="font-mono py-2"
                            >
                              <Folder className="w-3.5 h-3.5 mr-2 text-primary" />
                              {crumb.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />

                      {/* Parent Folder */}
                      <button
                        onClick={() => navigateTo(breadcrumbs[breadcrumbs.length - 2].path)}
                        className="px-1.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted max-w-[90px] truncate"
                        title={breadcrumbs[breadcrumbs.length - 2].name}
                      >
                        {breadcrumbs[breadcrumbs.length - 2].name}
                      </button>

                      <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />

                      {/* Current Folder */}
                      <button
                        onClick={() => navigateTo(breadcrumbs[breadcrumbs.length - 1].path)}
                        className="px-1.5 py-1 rounded-md bg-primary/10 text-primary font-semibold max-w-[95px] truncate"
                        title={breadcrumbs[breadcrumbs.length - 1].name}
                      >
                        {breadcrumbs[breadcrumbs.length - 1].name}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Actions: Direct Upload, Chunk Upload Drawer, New Folder, Refresh, Windows Explorer View Dropdown */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Hidden Direct File Input (supports multi-file selection) */}
                <input
                  type="file"
                  ref={directFileInputRef}
                  onChange={handleDirectFileInput}
                  multiple
                  className="hidden"
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => directFileInputRef.current?.click()}
                  disabled={isUploadingDirect}
                  className="gap-1.5 text-xs shadow-xs"
                  title="Upload one or multiple files directly"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {isUploadingDirect ? 'Uploading...' : 'Direct Upload'}
                </Button>

                <Button
                  size="sm"
                  onClick={() => setUploadOpen(true)}
                  className="gap-1.5 text-xs shadow-xs"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  Upload Chunks
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNewFolderOpen(true)}
                  className="gap-1.5 text-xs"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  New Folder
                </Button>

                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => loadDirectory(currentPath)}
                  disabled={isPending || isLoading}
                  title="Refresh Directory"
                  className="h-8 w-8"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${(isPending || isLoading) ? 'animate-spin text-primary' : ''}`}
                  />
                </Button>

                {/* Windows Explorer "View" Dropdown Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-center gap-1.5 text-xs font-medium border border-input bg-background hover:bg-muted hover:text-accent-foreground h-8 rounded-md px-3 shadow-xs cursor-pointer transition-colors">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
                    <span>View</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 text-xs p-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Layout
                    </div>
                    <DropdownMenuItem
                      onClick={() => handleSetViewMode('extra-large')}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4 text-indigo-500" />
                        Extra Large Icons
                      </span>
                      {viewMode === 'extra-large' && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleSetViewMode('large')}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Grid className="w-4 h-4 text-sky-500" />
                        Large Icons
                      </span>
                      {viewMode === 'large' && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleSetViewMode('medium')}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Grid2X2 className="w-4 h-4 text-emerald-500" />
                        Medium Icons
                      </span>
                      {viewMode === 'medium' && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleSetViewMode('small')}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Square className="w-3.5 h-3.5 text-amber-500" />
                        Small Icons
                      </span>
                      {viewMode === 'small' && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleSetViewMode('list')}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <List className="w-4 h-4 text-purple-500" />
                        List
                      </span>
                      {viewMode === 'list' && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={() => handleSetViewMode('details')}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <TableProperties className="w-4 h-4 text-rose-500" />
                        Details
                      </span>
                      {viewMode === 'details' && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Panes
                    </div>

                    <DropdownMenuItem
                      onClick={handleTogglePreviewPane}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <PanelRight className="w-4 h-4 text-primary" />
                        Preview Pane
                      </span>
                      {previewPaneOpen && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={handleToggleDetailsPane}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-primary" />
                        Details Pane
                      </span>
                      {detailsPaneOpen && <Check className="w-3.5 h-3.5 text-primary" />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Physical Storage Location Indicator */}
            {physicalPath && (
              <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground font-mono">
                <div className="flex items-center gap-1.5 truncate">
                  <HardDrive className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>Physical Storage:</span>
                  <span className="text-foreground font-semibold truncate select-all">
                    {physicalPath}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono bg-primary/5 text-primary border-primary/20"
                  >
                    Drive {storageDrive}: Active
                  </Badge>
                  <span>
                    {files.length} item{files.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Search & Category Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Input
                placeholder="Search items in this folder..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-xs pl-3"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
              {[
                { key: 'all', label: 'All Items' },
                { key: 'folders', label: 'Folders' },
                { key: 'document', label: 'Docs' },
                { key: 'image', label: 'Images' },
                { key: 'video', label: 'Videos' },
                { key: 'audio', label: 'Audio' },
                { key: 'code', label: 'Code' },
                { key: 'archive', label: 'Archives' },
              ].map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                    selectedCategory === cat.key
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Directory & Side Preview Pane Container */}
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/* Left Main Browser Workspace */}
            <div className="flex-1 min-w-0 w-full">
              {/* Initial skeleton: only show when files list is empty (first load) */}
              {(isLoading && files.length === 0) ? (
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div
                      key={i}
                      className="h-32 rounded-xl bg-muted/40 animate-pulse border border-border/50"
                    />
                  ))}
                </div>
              ) : (
                /* Navigation overlay: existing content stays visible with reduced opacity + spinner */
                <div className={`relative transition-opacity duration-150 ${(isPending || (isLoading && files.length > 0)) ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                  {(isPending || (isLoading && files.length > 0)) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <div className="bg-background/80 backdrop-blur-sm rounded-xl px-4 py-2.5 flex items-center gap-2 shadow-md border border-border/60 text-xs text-muted-foreground">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                        Loading...
                      </div>
                    </div>
                  )}
                  {displayedItems.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center mx-auto mb-3">
                    <Folder className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-foreground">Directory is Empty</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    No files or subfolders found on physical disk. Click &quot;Upload Chunks&quot; or
                    &quot;New Folder&quot; to add files directly to drive {storageDrive}:.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setNewFolderOpen(true)}
                      variant="outline"
                      className="text-xs"
                    >
                      <FolderPlus className="w-3.5 h-3.5 mr-1" /> New Folder
                    </Button>
                    <Button size="sm" onClick={() => setUploadOpen(true)} className="text-xs">
                      <UploadCloud className="w-3.5 h-3.5 mr-1" /> Upload Files
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* ── Dedicated Mobile 2-Column Grid (< md) ────────────────────────── */}
                  <div className="grid grid-cols-2 gap-3 p-1 md:hidden">
                    {displayedItems.map((item) => {
                      const cleanPath = item.path.replace(/^\/+/, '');
                      const streamUrl = `/api/files/stream?path=${encodeURIComponent(cleanPath)}&userId=${encodeURIComponent(currentUser.id)}`;
                      const isSelected = selectedItem?.path === item.path;

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (item.isDirectory) {
                              navigateTo(item.path);
                            } else {
                              if (
                                ['video', 'image', 'audio', 'code'].includes(item.category) ||
                                item.extension === 'pdf' ||
                                item.category === 'document'
                              ) {
                                setPreviewFile(item);
                                setPreviewOpen(true);
                              } else {
                                handleDownloadFile(item);
                              }
                            }
                          }}
                          className={`group relative flex flex-col justify-between rounded-xl border p-2.5 shadow-xs active:scale-[0.98] transition-all select-none overflow-hidden ${
                            isSelected
                              ? 'bg-primary/5 border-primary ring-2 ring-primary/40'
                              : 'bg-card border-border/80 hover:border-primary/40'
                          }`}
                        >
                          {/* Top-Right 3-Dot Touch Menu Button (min 44px x 44px) */}
                          <div className="absolute top-1 right-1 z-10">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                onClick={(e) => e.stopPropagation()}
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground bg-background/60 backdrop-blur-xs active:bg-muted"
                                title="Actions"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44 text-xs">
                                {!item.isDirectory && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewFile(item);
                                      setPreviewOpen(true);
                                    }}
                                    className="py-2.5"
                                  >
                                    <Eye className="w-4 h-4 mr-2" /> Full Preview
                                  </DropdownMenuItem>
                                )}
                                {!item.isDirectory && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadFile(item);
                                    }}
                                    className="py-2.5"
                                  >
                                    <Download className="w-4 h-4 mr-2" /> Download
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShareFile(item);
                                    setShareOpen(true);
                                  }}
                                  className="py-2.5"
                                >
                                  <Share2 className="w-4 h-4 mr-2" /> Share Link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(item);
                                  }}
                                  className="py-2.5 text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" /> Move to Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          {/* High-Visibility Thumbnail Hero */}
                          <div className="w-full h-28 rounded-lg bg-muted/40 overflow-hidden flex items-center justify-center relative mb-2">
                            {item.isDirectory ? (
                              <Folder className="w-14 h-14 text-primary fill-primary/20" />
                            ) : item.category === 'image' ? (
                              /* Photos / Images: actual image thumbnails */
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={streamUrl}
                                alt={item.name}
                                loading="lazy"
                                className="object-cover rounded-md w-full h-28"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : item.category === 'video' ? (
                              /* Videos: Distinct high-contrast video badge with Film icon */
                              <div className="w-full h-full flex flex-col items-center justify-center bg-indigo-950/20 text-indigo-500 gap-1.5 p-2">
                                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center ring-2 ring-indigo-500/20">
                                  <Film className="w-5 h-5 text-indigo-500" />
                                </div>
                                <Badge variant="outline" className="text-[10px] font-mono py-0 px-1.5 bg-background/80 text-indigo-500 border-indigo-500/30">
                                  {(item.extension || 'VIDEO').toUpperCase()}
                                </Badge>
                              </div>
                            ) : (
                              /* Other files: Prominent, color-coded file type icons centered */
                              <div className="w-full h-full flex flex-col items-center justify-center p-2">
                                {getFileIcon(item, 'w-10 h-10')}
                              </div>
                            )}
                          </div>

                          {/* Card Details */}
                          <div className="flex flex-col items-center text-center w-full px-1">
                            <p className="truncate text-xs font-semibold text-center w-full px-1 text-foreground" title={item.name}>
                              {item.name}
                            </p>
                            <span className="text-[11px] text-muted-foreground font-mono mt-0.5">
                              {item.isDirectory ? 'Folder' : formatBytes(item.sizeBytes)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Desktop Customizable View Modes (>= md) ────────────────── */}
                  <div className="hidden md:block">
                    {viewMode === 'extra-large' ? (
                /* 1. Extra Large Icons Layout (200px+ cards with rich previews) */
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                  {displayedItems.map((item) => {
                    const isSelected = selectedItem?.path === item.path;
                    const cleanPath = item.path.replace(/^\/+/, '');
                    const streamUrl = `/api/files/stream?path=${encodeURIComponent(cleanPath)}&userId=${encodeURIComponent(currentUser.id)}`;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        className={`group relative p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between select-none min-h-[220px] ${
                          isSelected
                            ? 'bg-primary/5 border-primary shadow-sm ring-2 ring-primary/40'
                            : 'bg-card border-border/80 hover:bg-muted/40 hover:border-primary/40 hover:shadow-xs'
                        }`}
                      >
                        {/* Preview Hero Box (140px) */}
                        <div className="w-full h-36 rounded-xl bg-muted/40 border border-border/50 overflow-hidden flex items-center justify-center relative">
                          {item.isDirectory ? (
                            <Folder className="w-16 h-16 text-primary fill-primary/20 transition-transform group-hover:scale-105" />
                          ) : item.category === 'image' ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={streamUrl}
                              alt={item.name}
                              loading="lazy"
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : item.category === 'video' ? (
                            <div className="flex flex-col items-center gap-1.5 text-indigo-500">
                              <Film className="w-14 h-14" />
                              <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                Video
                              </Badge>
                            </div>
                          ) : item.category === 'audio' ? (
                            <div className="flex flex-col items-center gap-1.5 text-emerald-500">
                              <Music className="w-14 h-14" />
                              <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                Audio
                              </Badge>
                            </div>
                          ) : item.extension === 'pdf' ? (
                            <div className="flex flex-col items-center gap-1.5 text-rose-500">
                              <FileText className="w-14 h-14" />
                              <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                PDF
                              </Badge>
                            </div>
                          ) : item.category === 'code' ? (
                            <div className="flex flex-col items-center gap-1.5 text-amber-500">
                              <Code className="w-14 h-14" />
                              <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono">
                                {(item.extension || 'CODE').toUpperCase()}
                              </Badge>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                              {getFileIcon(item, 'w-12 h-12')}
                            </div>
                          )}

                          {/* Quick Action Overlay Trigger */}
                          <div className="absolute top-2 right-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                onClick={(e) => e.stopPropagation()}
                                className="opacity-0 group-hover:opacity-100 h-7 w-7 p-0 rounded-lg bg-background/80 hover:bg-background backdrop-blur-xs border border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all shadow-xs"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 text-xs">
                                {!item.isDirectory && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPreviewFile(item);
                                      setPreviewOpen(true);
                                    }}
                                  >
                                    <Eye className="w-3.5 h-3.5 mr-2" /> Full Preview
                                  </DropdownMenuItem>
                                )}
                                {!item.isDirectory && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDownloadFile(item);
                                    }}
                                  >
                                    <Download className="w-3.5 h-3.5 mr-2" /> Download
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShareFile(item);
                                    setShareOpen(true);
                                  }}
                                >
                                  <Share2 className="w-3.5 h-3.5 mr-2" /> Share Link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteItem(item);
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Move to Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Title & Metadata */}
                        <div className="mt-2.5">
                          <p
                            className="font-semibold text-xs text-foreground truncate leading-snug"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-1">
                            <span>{item.isDirectory ? 'Folder' : formatBytes(item.sizeBytes)}</span>
                            <span>{new Date(item.modifiedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'large' ? (
                /* 2. Large Icons Layout (Default Grid) */
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {displayedItems.map((item) => {
                    const isSelected = selectedItem?.path === item.path;
                    const cleanPath = item.path.replace(/^\/+/, '');
                    const streamUrl = `/api/files/stream?path=${encodeURIComponent(cleanPath)}&userId=${encodeURIComponent(currentUser.id)}`;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        className={`group relative p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between select-none ${
                          isSelected
                            ? 'bg-primary/5 border-primary shadow-xs ring-2 ring-primary/40'
                            : 'bg-card border-border/80 hover:bg-muted/40 hover:border-primary/40 hover:shadow-xs'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-12 h-12 rounded-lg bg-muted/60 flex items-center justify-center overflow-hidden shrink-0">
                            {item.category === 'image' && !item.isDirectory ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={streamUrl}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              getFileIcon(item, 'w-6 h-6')
                            )}
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              onClick={(e) => e.stopPropagation()}
                              className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-opacity"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 text-xs">
                              {!item.isDirectory && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewFile(item);
                                    setPreviewOpen(true);
                                  }}
                                >
                                  <Eye className="w-3.5 h-3.5 mr-2" /> Full Preview
                                </DropdownMenuItem>
                              )}
                              {!item.isDirectory && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadFile(item);
                                  }}
                                >
                                  <Download className="w-3.5 h-3.5 mr-2" /> Download
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShareFile(item);
                                  setShareOpen(true);
                                }}
                              >
                                <Share2 className="w-3.5 h-3.5 mr-2" /> Share Link
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteItem(item);
                                }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" /> Move to Archive
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="mt-3">
                          <p
                            className="font-semibold text-xs text-foreground truncate"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                            <span>{item.isDirectory ? 'Folder' : formatBytes(item.sizeBytes)}</span>
                            <span>{new Date(item.modifiedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'medium' ? (
                /* 3. Medium Icons Layout (Compact Grid Cards) */
                <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                  {displayedItems.map((item) => {
                    const isSelected = selectedItem?.path === item.path;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col items-center text-center justify-between select-none ${
                          isSelected
                            ? 'bg-primary/5 border-primary shadow-xs ring-2 ring-primary/40'
                            : 'bg-card border-border/80 hover:bg-muted/40 hover:border-primary/40'
                        }`}
                      >
                        <div className="p-2 rounded-lg bg-muted/60 mb-2 mt-1">
                          {getFileIcon(item, 'w-7 h-7')}
                        </div>
                        <div className="w-full">
                          <p
                            className="font-medium text-[11px] text-foreground truncate w-full"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                          <span className="text-[10px] text-muted-foreground font-mono block mt-0.5">
                            {item.isDirectory ? 'Folder' : formatBytes(item.sizeBytes)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'small' ? (
                /* 4. Small Icons Layout (Horizontal Compact Cards) */
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {displayedItems.map((item) => {
                    const isSelected = selectedItem?.path === item.path;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        className={`group relative p-2 px-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2.5 select-none ${
                          isSelected
                            ? 'bg-primary/5 border-primary shadow-xs ring-2 ring-primary/40'
                            : 'bg-card border-border/80 hover:bg-muted/40 hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {getFileIcon(item, 'w-4 h-4')}
                          <span
                            className="text-xs font-medium text-foreground truncate"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                          {item.isDirectory ? 'DIR' : formatBytes(item.sizeBytes)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'list' ? (
                /* 5. List Layout (Compact Vertical List) */
                <div className="rounded-xl border border-border/80 bg-card overflow-hidden divide-y divide-border/60">
                  {displayedItems.map((item) => {
                    const isSelected = selectedItem?.path === item.path;

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        onDoubleClick={() => handleItemDoubleClick(item)}
                        className={`px-3 py-2 flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer select-none ${
                          isSelected ? 'bg-primary/10 font-medium' : 'hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {getFileIcon(item, 'w-4 h-4')}
                          <span className="truncate text-foreground" title={item.name}>
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-muted-foreground text-[11px] shrink-0 font-mono">
                          <span>{item.isDirectory ? '--' : formatBytes(item.sizeBytes)}</span>
                          <span>{new Date(item.modifiedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 6. Details Layout (Tabular View with columns) */
                <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-muted-foreground font-medium select-none">
                        <th className="py-2.5 px-4 text-left">Name</th>
                        <th className="py-2.5 px-4 text-left w-24">Type</th>
                        <th className="py-2.5 px-4 text-left w-28">Size</th>
                        <th className="py-2.5 px-4 text-left w-36">Date Modified</th>
                        <th className="py-2.5 px-4 text-right w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {displayedItems.map((item) => {
                        const isSelected = selectedItem?.path === item.path;

                        return (
                          <tr
                            key={item.id}
                            onClick={() => handleItemClick(item)}
                            onDoubleClick={() => handleItemDoubleClick(item)}
                            className={`transition-colors cursor-pointer select-none ${
                              isSelected
                                ? 'bg-primary/10 hover:bg-primary/15'
                                : 'hover:bg-muted/40'
                            }`}
                          >
                            <td className="py-2.5 px-4 font-medium text-foreground">
                              <div className="flex items-center gap-2.5">
                                {getFileIcon(item)}
                                <span className="truncate max-w-xs sm:max-w-md">{item.name}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground uppercase text-[10px] font-mono">
                              {item.isDirectory ? 'DIR' : item.extension || 'FILE'}
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground font-mono">
                              {item.isDirectory ? '--' : formatBytes(item.sizeBytes)}
                            </td>
                            <td className="py-2.5 px-4 text-muted-foreground font-mono">
                              {new Date(item.modifiedAt).toLocaleDateString()}
                            </td>
                            <td
                              className="py-2.5 px-4 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1">
                                {!item.isDirectory && (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => {
                                      setPreviewFile(item);
                                      setPreviewOpen(true);
                                    }}
                                    title="Full Preview"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {!item.isDirectory && (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => handleDownloadFile(item)}
                                    title="Download"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => {
                                    setShareFile(item);
                                    setShareOpen(true);
                                  }}
                                  title="Share"
                                >
                                  <Share2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={() => handleDeleteItem(item)}
                                  title="Move to Archive"
                                  className="text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}
  </div>

              {/* Right Side Preview / Details Pane (Desktop only) */}
              {isSidePaneVisible && (
                <div className="hidden lg:block w-auto shrink-0 sticky top-4">
                <SidePreviewPane
                  selectedItem={selectedItem}
                  mode={paneMode}
                  onModeChange={(m) => {
                    setPaneMode(m);
                    if (m === 'preview') {
                      setPreviewPaneOpen(true);
                    } else {
                      setDetailsPaneOpen(true);
                    }
                  }}
                  userId={currentUser.id}
                  onClose={() => {
                    setPreviewPaneOpen(false);
                    setDetailsPaneOpen(false);
                    try {
                      localStorage.setItem(`homelab_preview_pane_${currentUser.id}`, 'false');
                      localStorage.setItem(`homelab_details_pane_${currentUser.id}`, 'false');
                    } catch {}
                  }}
                  onOpenModal={(file) => {
                    setPreviewFile(file);
                    setPreviewOpen(true);
                  }}
                  onDownload={(file) => handleDownloadFile(file)}
                  onShare={(file) => {
                    setShareFile(file);
                    setShareOpen(true);
                  }}
                  onNavigateFolder={(folderPath) => navigateTo(folderPath)}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Media Preview Modal */}
      <MediaPreviewModal
        file={previewFile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        userId={currentUser.id}
        onDownload={(f) => handleDownloadFile(f)}
      />

      {/* Share Link Generator Modal */}
      <CreateShareModal file={shareFile} open={shareOpen} onOpenChange={setShareOpen} />

      {/* Chunk Upload Modal */}
      <ChunkUploadModal
        currentPath={physicalPath || currentPath}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploadComplete={async (fileName, size) => {
          showNotification(
            'success',
            `Uploaded "${fileName}" (${formatBytes(size)}) to physical disk.`
          );
          await loadDirectory(currentPath);
        }}
      />

      {/* Global Upload Error Dialog */}
      <UploadErrorDialog
        open={isGlobalUploadErrorOpen}
        onOpenChange={setIsGlobalUploadErrorOpen}
        errorInfo={globalUploadErrorInfo}
      />

      {/* New Physical Folder Dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">Folder Name</Label>
              <Input
                placeholder="e.g. Documents, Invoices, Raw Video"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFolder();
                }}
                autoFocus
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Will be created physically at{' '}
              <code className="font-mono text-foreground font-semibold">{physicalPath}</code> on
              Drive {storageDrive}:.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNewFolderOpen(false)}
              disabled={isCreatingFolder}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCreateFolder}
              disabled={isCreatingFolder || !newFolderName.trim()}
            >
              {isCreatingFolder ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Real-time Floating Upload Progress Widget */}
      <UploadProgressWidget
        items={uploadItems}
        isOpen={isUploadWidgetOpen}
        onClose={() => setIsUploadWidgetOpen(false)}
        onCancelItem={handleCancelUploadItem}
        onRetryItem={handleRetryUploadItem}
      />
    </div>
  );
}

export function FileBrowser(props: FileBrowserProps) {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">
          Scanning host filesystem...
        </div>
      }
    >
      <FileBrowserInner {...props} />
    </Suspense>
  );
}
