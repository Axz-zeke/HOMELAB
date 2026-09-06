'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { FileItem, FileCategory, UserRole } from '@/lib/types';
import { validatePathAccess } from '@/lib/rbac/path-validator';
import {
  readDirectoryContents,
  createPhysicalDirectory,
  archiveFileAction,
} from '@/lib/actions/files';
import { writePhysicalFileAction } from '@/lib/actions/upload';
import { checkQuota } from '@/lib/actions/quota';
import { MediaPreviewModal } from '@/components/files/MediaPreviewModal';
import { CreateShareModal } from '@/components/shares/CreateShareModal';
import { ChunkUploadModal } from '@/components/upload/ChunkUploadModal';
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
  List,
  UploadCloud,
  FolderPlus,
  Share2,
  Trash2,
  MoreVertical,
  ChevronRight,
  ShieldAlert,
  HardDrive,
  Eye,
  CheckCircle2,
  ArrowLeft,
  RefreshCw,
  Upload,
  AlertTriangle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
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

  // Direct fast upload ref
  const directFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingDirect, setIsUploadingDirect] = useState(false);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // 1. RBAC Path Validation Check
  const accessCheck = useMemo(() => {
    return validatePathAccess(currentUser, currentPath, 'read', userPermissions);
  }, [currentUser, currentPath, userPermissions]);

  // Load Real Directory Contents from Physical Storage
  const loadDirectory = async (targetPath: string) => {
    setIsLoading(true);
    try {
      const res = await readDirectoryContents(targetPath, currentUser.id);
      if (res.success) {
        setFiles(res.items);
        setPhysicalPath(res.physicalPath);
        setStorageDrive(res.storageDrive);
        setBreadcrumbs(res.breadcrumbs);
      } else {
        showNotification('error', res.error || 'Failed to read directory.');
      }
    } catch (err: any) {
      console.error('Error loading directory:', err);
      showNotification('error', err?.message || 'Failed to inspect filesystem.');
    } finally {
      setIsLoading(false);
    }
  };

  // Sync with currentPath and currentUser changes
  useEffect(() => {
    loadDirectory(currentPath);
  }, [currentPath, currentUser.id]);

  // Update navigation path and push state to URL search params
  const navigateTo = (newPath: string) => {
    const clean = newPath || '/';
    const check = validatePathAccess(currentUser, clean, 'read', userPermissions);
    if (!check.allowed && !isSuperadmin) {
      showNotification('error', check.reason || 'Access denied to this folder.');
      return;
    }

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

  // Handle Folder Click
  const handleItemClick = (item: FileItem) => {
    if (item.isDirectory) {
      navigateTo(item.path);
    } else {
      setPreviewFile(item);
      setPreviewOpen(true);
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
    if (!newFolderName.trim()) return;
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

  // Delete / Move to Archive — supports both files and folders
  const handleDeleteItem = async (item: FileItem) => {
    const itemType = item.isDirectory ? 'folder' : 'file';
    if (!confirm(`Move ${itemType} "${item.name}" to the Archive storage pool?\n\n${item.isDirectory ? 'All contents inside this folder will also be archived.' : ''}`)) {
      return;
    }
    try {
      // Pass currentPath (the parent dir) so the server resolves: parentPhysical + item.name
      const res = await archiveFileAction(currentPath, item.name, currentUser.id);
      if (res.success) {
        showNotification('success', `"${item.name}" (${itemType}) archived to storage pool.`);
        await loadDirectory(currentPath);
      } else {
        showNotification('error', res.error || `Failed to archive ${itemType}.`);
      }
    } catch (err: any) {
      showNotification('error', err?.message || `Failed to archive ${itemType}.`);
    }
  };


  // Direct fast single-file upload
  const handleDirectFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check storage quota before reading and writing file
    const quotaCheck = await checkQuota(currentUser.id, file.size);
    if (!quotaCheck.allowed) {
      showNotification('error', quotaCheck.error || 'Storage Quota Exceeded');
      if (directFileInputRef.current) directFileInputRef.current.value = '';
      return;
    }

    setIsUploadingDirect(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const res = await writePhysicalFileAction(file.name, base64Data, physicalPath || currentPath, currentUser.id);
        if (res.success) {
          showNotification('success', `Uploaded "${file.name}" to physical disk.`);
          await loadDirectory(currentPath);
        } else {
          showNotification('error', res.error || 'Failed to upload file.');
        }
        setIsUploadingDirect(false);
        if (directFileInputRef.current) directFileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      showNotification('error', err?.message || 'Direct upload failed.');
      setIsUploadingDirect(false);
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

  const getFileIcon = (item: FileItem) => {
    if (item.isDirectory) return <Folder className="w-5 h-5 text-primary fill-primary/20 shrink-0" />;
    switch (item.category) {
      case 'video': return <Film className="w-5 h-5 text-indigo-500 shrink-0" />;
      case 'image': return <ImageIcon className="w-5 h-5 text-sky-500 shrink-0" />;
      case 'audio': return <Music className="w-5 h-5 text-emerald-500 shrink-0" />;
      case 'code': return <Code className="w-5 h-5 text-amber-500 shrink-0" />;
      case 'archive': return <Archive className="w-5 h-5 text-purple-500 shrink-0" />;
      default: return <FileText className="w-5 h-5 text-muted-foreground shrink-0" />;
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

  return (
    <div className="space-y-4">
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
                // For standard users, navigate to their home directory.
                // For privileged users, navigate to the storage root.
                const safeHome = (!isSuperadmin && !isAdmin && currentUser?.home_directory_path)
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
                  title="Navigate Up"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>

                <div className="flex items-center gap-1 shrink-0 font-mono text-xs">
                  {breadcrumbs.map((crumb, idx) => (
                    <React.Fragment key={crumb.path}>
                      {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
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
              </div>

              {/* Actions: Direct Upload, Chunk Upload Drawer, New Folder, View Mode Toggle */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Hidden Direct File Input */}
                <input
                  type="file"
                  ref={directFileInputRef}
                  onChange={handleDirectFileSelect}
                  className="hidden"
                />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => directFileInputRef.current?.click()}
                  disabled={isUploadingDirect}
                  className="gap-1.5 text-xs shadow-xs"
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
                  disabled={isLoading}
                  title="Refresh Directory"
                  className="h-8 w-8"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-primary' : ''}`} />
                </Button>

                <div className="flex items-center border rounded-lg p-0.5 bg-muted/30">
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="xs"
                    onClick={() => setViewMode('grid')}
                    className="h-7 w-7 p-0"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="xs"
                    onClick={() => setViewMode('list')}
                    className="h-7 w-7 p-0"
                  >
                    <List className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Physical Storage Location Indicator */}
            {physicalPath && (
              <div className="pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground font-mono">
                <div className="flex items-center gap-1.5 truncate">
                  <HardDrive className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>Physical Storage:</span>
                  <span className="text-foreground font-semibold truncate select-all">{physicalPath}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-[10px] font-mono bg-primary/5 text-primary border-primary/20">
                    Drive {storageDrive}: Active
                  </Badge>
                  <span>{files.length} item{files.length === 1 ? '' : 's'}</span>
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

          {/* Main Directory Items View */}
          {isLoading ? (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-32 rounded-xl bg-muted/40 animate-pulse border border-border/50" />
              ))}
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center mx-auto mb-3">
                <Folder className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-foreground">Directory is Empty</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                No files or subfolders found on physical disk. Click &quot;Upload Chunks&quot; or &quot;New Folder&quot; to add files directly to drive {storageDrive}:.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button size="sm" onClick={() => setNewFolderOpen(true)} variant="outline" className="text-xs">
                  <FolderPlus className="w-3.5 h-3.5 mr-1" /> New Folder
                </Button>
                <Button size="sm" onClick={() => setUploadOpen(true)} className="text-xs">
                  <UploadCloud className="w-3.5 h-3.5 mr-1" /> Upload Files
                </Button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {displayedItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="group relative p-3.5 rounded-xl border border-border/80 bg-card hover:bg-muted/40 hover:border-primary/40 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="p-2 rounded-lg bg-muted/60 group-hover:bg-primary/10 transition-colors">
                      {getFileIcon(item)}
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
                            <Eye className="w-3.5 h-3.5 mr-2" /> Preview
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
                    <p className="font-semibold text-xs text-foreground truncate" title={item.name}>
                      {item.name}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                      <span>{item.isDirectory ? 'Folder' : formatBytes(item.sizeBytes)}</span>
                      <span>{new Date(item.modifiedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* List View */
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground font-medium">
                    <th className="py-2.5 px-4 text-left">Name</th>
                    <th className="py-2.5 px-4 text-left w-24">Type</th>
                    <th className="py-2.5 px-4 text-left w-28">Size</th>
                    <th className="py-2.5 px-4 text-left w-36">Modified</th>
                    <th className="py-2.5 px-4 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {displayedItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className="hover:bg-muted/40 transition-colors cursor-pointer"
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
                      <td className="py-2.5 px-4 text-muted-foreground">
                        {new Date(item.modifiedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {!item.isDirectory && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => {
                                setPreviewFile(item);
                                setPreviewOpen(true);
                              }}
                              title="Preview"
                            >
                              <Eye className="w-3.5 h-3.5" />
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Media Preview Modal */}
      <MediaPreviewModal
        file={previewFile}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onDownload={(f) => {
          const a = document.createElement('a');
          a.href = `/api/download?path=${encodeURIComponent(f.path.replace(/^\//, ''))}`;
          a.download = f.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }}
      />

      {/* Share Link Generator Modal */}
      <CreateShareModal
        file={shareFile}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />

      {/* Chunk Upload Modal */}
      <ChunkUploadModal
        currentPath={physicalPath || currentPath}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploadComplete={async (fileName, size) => {
          showNotification('success', `Uploaded "${fileName}" (${formatBytes(size)}) to physical disk.`);
          await loadDirectory(currentPath);
        }}
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
              Will be created physically at <code className="font-mono text-foreground font-semibold">{physicalPath}</code> on Drive {storageDrive}:.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setNewFolderOpen(false)} disabled={isCreatingFolder}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateFolder} disabled={isCreatingFolder || !newFolderName.trim()}>
              {isCreatingFolder ? 'Creating...' : 'Create Folder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function FileBrowser(props: FileBrowserProps) {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Scanning host filesystem...</div>}>
      <FileBrowserInner {...props} />
    </Suspense>
  );
}
