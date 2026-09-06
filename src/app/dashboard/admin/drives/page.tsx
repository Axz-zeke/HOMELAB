'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getSystemDrivesAction,
  addStorageAction,
  removeStorageAction,
  reorderStoragePriorityAction,
} from '@/lib/actions/drives';
import { writePhysicalFileAction } from '@/lib/actions/upload';
import { DriveVolume, StoragePoolAllocation, StorageType } from '@/lib/types';
import {
  HardDrive,
  Plus,
  RefreshCw,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Archive,
  ChevronUp,
  ChevronDown,
  FolderCheck,
  Layers,
  ArrowDownUp,
  ShieldAlert,
  SlidersHorizontal
} from 'lucide-react';

export default function DriveManagementPage() {
  const [drives, setDrives] = useState<DriveVolume[]>([]);
  const [pools, setPools] = useState<StoragePoolAllocation[]>([]);
  const [isLoadingDrives, setIsLoadingDrives] = useState(true);
  const [storageRootPath, setStorageRootPath] = useState('D:\\NAS_Storage');
  const [chunkStagingDir, setChunkStagingDir] = useState('D:\\temp_uploads');
  const [isScanning, setIsScanning] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Test File Write State
  const [isWritingTest, setIsWritingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // "Add Storage" Modal State
  const [addStorageOpen, setAddStorageOpen] = useState(false);
  const [selectedDriveLetter, setSelectedDriveLetter] = useState('D');
  const [selectedType, setSelectedType] = useState<StorageType>('primary');
  const [selectedPriority, setSelectedPriority] = useState<number>(1);
  const [customPoolName, setCustomPoolName] = useState('Drive D: (Primary Storage)');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load real system drives & database pools
  const loadDrivesAndRegistry = async (isManualScan: boolean = false) => {
    if (isManualScan) setIsScanning(true);
    try {
      const res = await getSystemDrivesAction();
      if (res.success) {
        setDrives(res.drives);
        setPools(res.pools);
        setStorageRootPath(res.storageRootPath);
        setChunkStagingDir(res.chunkStagingDir);
        if (isManualScan) {
          showNotification('success', `Hardware scan complete: ${res.drives.length} physical volumes detected & synced.`);
        }
      } else {
        showNotification('error', res.error || 'Failed to inspect host drives.');
      }
    } catch (err: any) {
      console.error('Failed to load system drives:', err);
      showNotification('error', err?.message || 'Failed to inspect host drives.');
    } finally {
      setIsScanning(false);
      setIsLoadingDrives(false);
    }
  };

  useEffect(() => {
    loadDrivesAndRegistry();
  }, []);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  // Open "Add Storage" Modal
  const handleOpenAddStorage = (presetDriveLetter?: string) => {
    const candidateDrive = presetDriveLetter || (drives.find((d) => !d.isSystemDrive)?.mountPoint?.replace(/[:\\\/]/g, '').toUpperCase()) || 'D';
    setSelectedDriveLetter(candidateDrive);
    setSelectedType('primary');

    // Check existing primary pools
    const existingPrimaries = pools.filter((p) => p.type === 'primary');
    const nextPriority = existingPrimaries.length > 0 ? existingPrimaries.length + 1 : 1;
    setSelectedPriority(nextPriority);

    const name = nextPriority === 1
      ? `Drive ${candidateDrive}: (Primary Storage - Active Target)`
      : `Drive ${candidateDrive}: (Primary Storage - Priority ${nextPriority} Overflow)`;
    setCustomPoolName(name);
    setAddStorageOpen(true);
  };

  // When Drive Letter or Storage Type changes, update auto-generated name
  const handleDriveChange = (letter: string) => {
    setSelectedDriveLetter(letter);
    if (selectedType === 'primary') {
      const name = selectedPriority === 1
        ? `Drive ${letter}: (Primary Storage - Active Target)`
        : `Drive ${letter}: (Primary Storage - Priority ${selectedPriority} Overflow)`;
      setCustomPoolName(name);
    } else {
      setCustomPoolName(`Drive ${letter}: (Archive)`);
    }
  };

  const handleTypeChange = (type: StorageType) => {
    setSelectedType(type);
    if (type === 'primary') {
      const existingPrimaries = pools.filter((p) => p.type === 'primary');
      const nextPriority = existingPrimaries.length > 0 ? existingPrimaries.length + 1 : 1;
      setSelectedPriority(nextPriority);
      const name = nextPriority === 1
        ? `Drive ${selectedDriveLetter}: (Primary Storage - Active Target)`
        : `Drive ${selectedDriveLetter}: (Primary Storage - Priority ${nextPriority} Overflow)`;
      setCustomPoolName(name);
    } else {
      setSelectedPriority(99);
      setCustomPoolName(`Drive ${selectedDriveLetter}: (Archive)`);
    }
  };

  const handlePriorityChange = (priority: number) => {
    setSelectedPriority(priority);
    const name = priority === 1
      ? `Drive ${selectedDriveLetter}: (Primary Storage - Active Target)`
      : `Drive ${selectedDriveLetter}: (Primary Storage - Priority ${priority} Overflow)`;
    setCustomPoolName(name);
  };

  // Submit Simplified "Add Storage" with Priority
  const handleConfirmAddStorage = async () => {
    setIsSubmitting(true);
    try {
      const res = await addStorageAction(selectedDriveLetter, selectedType, customPoolName, selectedPriority);
      if (res.success && res.pool) {
        showNotification(
          'success',
          `Drive ${selectedDriveLetter}: added as ${selectedType === 'primary' ? `Primary (Priority ${res.pool.priority})` : 'Archive'} (${res.pool.targetDirectory}).`
        );
        setAddStorageOpen(false);
        await loadDrivesAndRegistry();
      } else {
        showNotification('error', res.error || 'Failed to add storage drive.');
      }
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to add storage drive.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Move Priority Up / Down
  const handleReorderPriority = async (poolId: string, direction: 'up' | 'down') => {
    try {
      const res = await reorderStoragePriorityAction(poolId, direction);
      if (res.success) {
        showNotification('success', 'Cascading overflow priority updated.');
        await loadDrivesAndRegistry();
      } else {
        showNotification('error', res.error || 'Failed to reorder priority.');
      }
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to reorder priority.');
    }
  };

  // Remove / Unassign Storage
  const handleRemoveStorage = async (storageId: string, name: string) => {
    if (!confirm(`Are you sure you want to unassign '${name}'? This will remove it from active storage routing without deleting any data on the disk.`)) {
      return;
    }
    try {
      const res = await removeStorageAction(storageId);
      if (res.success) {
        showNotification('success', `Unassigned '${name}' from storage pool.`);
        await loadDrivesAndRegistry();
      } else {
        showNotification('error', res.error || 'Failed to unassign storage.');
      }
    } catch (err: any) {
      showNotification('error', err?.message || 'Failed to unassign storage.');
    }
  };

  // Test Write to Active Primary Storage Pool (with Cascading Verification)
  const handleTestWrite = async () => {
    setIsWritingTest(true);
    setTestResult(null);

    const testContent = `HOMELAB CASCADING STORAGE POOL TEST\nTimestamp: ${new Date().toISOString()}\nTarget Directory: ${storageRootPath}\nBuffer Staging: ${chunkStagingDir}\nStatus: Verified Cascading Storage Write`;
    const base64Data = btoa(testContent);
    const filename = `cascading_pool_probe_${Date.now()}.txt`;

    try {
      const res = await writePhysicalFileAction(filename, base64Data, '', 'user-superadmin');
      if (res.success) {
        const cascadeNote = res.isCascaded
          ? ` [AUTO CASCADED to Drive ${res.driveLetter}: Priority ${res.priority} - ${res.cascadeReason}]`
          : ` [Drive ${res.driveLetter}: Priority ${res.priority}]`;
        setTestResult(`File written successfully: ${res.physicalPath} (${res.bytesWritten} bytes).${cascadeNote}`);
      } else {
        setTestResult(`Write failed: ${res.error}`);
      }
    } catch (err: any) {
      setTestResult(`Write failed: ${err?.message}`);
    } finally {
      setIsWritingTest(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(2)} TB`;
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
    return `${bytes} B`;
  };

  // Primary pools sorted by priority
  const primaryPools = pools.filter((p) => p.type === 'primary').sort((a, b) => (a.priority || 99) - (b.priority || 99));
  const overflowPools = primaryPools.filter((p) => p.priority > 1);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Cascading Storage Pools</h2>
            <Badge variant="outline" className="text-xs font-mono bg-primary/10 text-primary border-primary/20">
              Overflow Spanning
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Assign multiple physical drives as Primary Storage with priority ordering. When a drive fills up (&lt;5% free), uploads automatically cascade to the next drive.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={handleTestWrite}
            disabled={isWritingTest}
            className="gap-2 shadow-xs text-xs"
          >
            <FileCheck className="w-4 h-4 text-emerald-500" />
            {isWritingTest ? 'Writing Probe...' : 'Test Cascading Write'}
          </Button>

          <Button
            variant="outline"
            onClick={() => loadDrivesAndRegistry(true)}
            disabled={isScanning}
            className="gap-2 shadow-xs text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-primary' : ''}`} />
            {isScanning ? 'Scanning...' : 'Rescan Disks'}
          </Button>

          <Button
            onClick={() => handleOpenAddStorage()}
            className="gap-1.5 shadow-xs text-xs"
          >
            <Plus className="w-4 h-4" />
            Add Storage
          </Button>
        </div>
      </div>

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

      {/* Test Result Banner */}
      {testResult && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2.5 animate-in fade-in-0 duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold">Direct Storage Probe Result:</strong>
            <p className="font-mono mt-0.5 select-all">{testResult}</p>
          </div>
        </div>
      )}

      {/* Cascading Pool Status Banner */}
      <div className="p-4 rounded-xl bg-muted/40 border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
            <FolderCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Direct Active Target (Priority 1)
              </span>
              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                Active Direct Target
              </Badge>
              {overflowPools.length > 0 && (
                <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 text-[10px]">
                  {overflowPools.length} Overflow Target{overflowPools.length > 1 ? 's' : ''} Configured
                </Badge>
              )}
            </div>
            <p className="font-mono text-sm font-semibold text-foreground mt-0.5 select-all">
              {storageRootPath}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-1">
              <span>
                Threshold Rule: <strong className="text-foreground">&lt; 5% free space</strong> or file size limit triggers automatic cascade to next priority drive.
              </span>
              {overflowPools.length > 0 && (
                <span className="font-mono text-primary">
                  Cascade Chain: {primaryPools.map((p) => `${p.driveLetter}: (P${p.priority})`).join(' ➔ ')}
                </span>
              )}
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleOpenAddStorage()}
          className="shrink-0 gap-1.5 text-xs self-start sm:self-center"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Overflow Drive
        </Button>
      </div>

      {/* Assigned Storage Pools Table */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">Assigned Storage Pools</CardTitle>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {pools.length} Allocated
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Configured Primary drives with cascade priority ordering, and long-term Archive pools.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => handleOpenAddStorage()}
            className="gap-1.5 text-xs shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Storage
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[210px]">Drive / Mount</TableHead>
                <TableHead className="w-[220px]">Role & Cascade Priority</TableHead>
                <TableHead>Capacity / Free Space</TableHead>
                <TableHead className="w-[100px] text-center">Priority Order</TableHead>
                <TableHead className="text-right w-[110px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">
                    No storage drives currently assigned. Click &quot;Add Storage&quot; to assign a connected physical disk.
                  </TableCell>
                </TableRow>
              ) : (
                pools.map((pool) => {
                  const isPrimary = pool.type === 'primary';
                  const priority = pool.priority || 1;
                  const total = pool.totalSpaceBytes || 0;
                  const used = pool.usedSpaceBytes || 0;
                  const free = Math.max(0, total - used);
                  const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
                  const percentFree = 100 - percentUsed;
                  const isLowSpace = isPrimary && percentFree < 5;

                  // Find primary index to determine Move Up / Move Down bounds
                  const primaryIndex = primaryPools.findIndex((p) => p.id === pool.id);
                  const isFirstPrimary = primaryIndex === 0;
                  const isLastPrimary = primaryIndex === primaryPools.length - 1;

                  return (
                    <TableRow key={pool.id} className="hover:bg-muted/40">
                      {/* 1. Drive Letter / Mount Point */}
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2.5">
                          <div className={`p-2 rounded-lg shrink-0 ${isPrimary ? (priority === 1 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400') : 'bg-muted text-muted-foreground'}`}>
                            {isPrimary ? <HardDrive className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-sm font-bold text-foreground">
                                Drive {pool.driveLetter}:
                              </span>
                              <span className="text-xs text-muted-foreground font-mono">
                                ({pool.mountPath})
                              </span>
                            </div>
                            <p className="font-mono text-[11px] text-muted-foreground truncate max-w-[200px]" title={pool.targetDirectory}>
                              {pool.targetDirectory}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* 2. Role & Cascade Priority Badges */}
                      <TableCell>
                        {isPrimary ? (
                          priority === 1 ? (
                            <div className="space-y-0.5">
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-semibold">
                                Primary (Priority 1)
                              </Badge>
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                Direct Active Upload Target
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30 text-[11px] font-semibold">
                                Primary (Priority {priority})
                              </Badge>
                              <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                                Overflow Target (&lt;5% cascade)
                              </p>
                            </div>
                          )
                        ) : (
                          <div className="space-y-0.5">
                            <Badge variant="secondary" className="text-[11px] font-medium text-muted-foreground">
                              Archive
                            </Badge>
                            <p className="text-[10px] text-muted-foreground">
                              Soft Delete / Recycle Target
                            </p>
                          </div>
                        )}
                      </TableCell>

                      {/* 3. Capacity / Free Space Progress Bar */}
                      <TableCell>
                        <div className="space-y-1.5 max-w-md">
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              {percentUsed}% Used
                              {isLowSpace && (
                                <Badge variant="outline" className="text-[9px] font-sans text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10">
                                  Auto-Cascading
                                </Badge>
                              )}
                            </span>
                            <span className="text-muted-foreground">
                              {formatBytes(free)} free of {formatBytes(total)}
                            </span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                percentUsed > 95 ? 'bg-destructive' : percentUsed > 80 ? 'bg-amber-500' : priority === 1 ? 'bg-emerald-500' : isPrimary ? 'bg-blue-500' : 'bg-slate-500'
                              }`}
                              style={{ width: `${percentUsed}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>

                      {/* 4. Priority Order Reorder Buttons (Move Up / Move Down) */}
                      <TableCell className="text-center">
                        {isPrimary ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={isFirstPrimary}
                              onClick={() => handleReorderPriority(pool.id, 'up')}
                              title="Move Up (Increase Priority)"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              disabled={isLastPrimary}
                              onClick={() => handleReorderPriority(pool.id, 'down')}
                              title="Move Down (Decrease Priority / Later Overflow)"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-30"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* 5. Simple Action Toggle (Remove / Unassign Drive) */}
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveStorage(pool.id, pool.name)}
                          className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                          title="Remove / Unassign Drive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Unassign</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Connected Host Hardware Disks Quick Inspection */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold tracking-tight">Detected Host Hardware Disks</h3>
            <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              Live Hardware
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {drives.length} physical volumes detected
          </span>
        </div>

        {isLoadingDrives ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse h-28 bg-muted/40" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {drives.map((drive) => {
              const letter = drive.mountPoint?.replace(/[:\\\/]/g, '').toUpperCase() || '';
              const percentUsed = drive.totalSpaceBytes > 0
                ? Math.round((drive.usedSpaceBytes / drive.totalSpaceBytes) * 100)
                : 0;
              const assignedPool = pools.find((p) => p.driveLetter === letter);

              return (
                <div
                  key={drive.id}
                  className="p-3.5 rounded-xl border border-border/80 bg-card text-card-foreground shadow-xs flex flex-col justify-between space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm font-mono text-foreground">
                          {letter}:
                        </span>
                        <span className="text-xs font-medium text-muted-foreground truncate max-w-[120px]">
                          {drive.name}
                        </span>
                      </div>
                      <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                        {drive.formatType} • {drive.temperatureCelsius || 34}°C
                      </p>
                    </div>

                    {drive.isSystemDrive ? (
                      <Badge variant="outline" className="text-[9px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                        OS (C:)
                      </Badge>
                    ) : assignedPool ? (
                      <Badge className={`text-[9px] ${assignedPool.type === 'primary' ? (assignedPool.priority === 1 ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white') : 'bg-secondary text-secondary-foreground'}`}>
                        {assignedPool.type === 'primary' ? `P${assignedPool.priority}` : 'Archive'}
                      </Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => handleOpenAddStorage(letter)}
                        className="text-[10px] h-6 px-2 gap-1 text-primary hover:bg-primary/10"
                      >
                        <Plus className="w-3 h-3" />
                        Assign
                      </Button>
                    )}
                  </div>

                  {/* Meter */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground mb-1">
                      <span>{percentUsed}% Used</span>
                      <span>{formatBytes(drive.totalSpaceBytes - drive.usedSpaceBytes)} free</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${percentUsed > 90 ? 'bg-destructive' : 'bg-primary'}`}
                        style={{ width: `${percentUsed}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* "Add Storage" Modal with Cascading Priority Ordering */}
      <Dialog open={addStorageOpen} onOpenChange={setAddStorageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Storage Drive</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* 1. Drive Selection Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Select Physical Drive</Label>
              <select
                value={selectedDriveLetter}
                onChange={(e) => handleDriveChange(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {drives.map((d) => {
                  const letter = d.mountPoint?.replace(/[:\\\/]/g, '').toUpperCase() || '';
                  const freeSpace = formatBytes(d.totalSpaceBytes - d.usedSpaceBytes);
                  return (
                    <option key={d.id} value={letter} disabled={d.isSystemDrive && selectedType === 'primary'}>
                      Drive {letter}:\ ({d.name}) — {freeSpace} free {d.isSystemDrive ? '[OS System C:]' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 2. Purpose Selection: TWO OPTIONS */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Purpose</Label>
              <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                {/* Option 1: Primary Storage */}
                <div
                  onClick={() => handleTypeChange('primary')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedType === 'primary'
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-border/80 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <HardDrive className={`w-4 h-4 ${selectedType === 'primary' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold text-xs text-foreground">Primary Storage</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                    Active files, uploads, and user folders.
                  </p>
                </div>

                {/* Option 2: Archive */}
                <div
                  onClick={() => handleTypeChange('archive')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    selectedType === 'archive'
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-border/80 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Archive className={`w-4 h-4 ${selectedType === 'archive' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold text-xs text-foreground">Archive</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                    Backups, cold storage, or media.
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Priority Ordering for Primary Storage */}
            {selectedType === 'primary' && (
              <div className="space-y-2 p-3 bg-muted/40 rounded-xl border border-border/70">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <ArrowDownUp className="w-3.5 h-3.5 text-primary" />
                    Cascading Overflow Priority
                  </Label>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Priority {selectedPriority}
                  </Badge>
                </div>

                <select
                  value={selectedPriority}
                  onChange={(e) => handlePriorityChange(parseInt(e.target.value, 10))}
                  className="w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value={1}>Priority 1 — Direct Active Upload Target</option>
                  <option value={2}>Priority 2 — Secondary Overflow Target</option>
                  <option value={3}>Priority 3 — Tertiary Overflow Target</option>
                  {selectedPriority > 3 && (
                    <option value={selectedPriority}>Priority {selectedPriority} — Overflow Target</option>
                  )}
                </select>

                <p className="text-[11px] text-muted-foreground leading-snug">
                  {selectedPriority === 1
                    ? 'Incoming uploads will save to this drive first. If free space drops below 5%, uploads cascade to Priority 2.'
                    : `Incoming uploads route to this drive automatically whenever Priority ${selectedPriority - 1} drive free space falls below 5%.`}
                </p>
              </div>
            )}

            {/* 4. Pool Name (Auto-generated with Custom Override) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Pool Name</Label>
              <Input
                value={customPoolName}
                onChange={(e) => setCustomPoolName(e.target.value)}
                placeholder="e.g. Drive D: (Primary Storage)"
                className="text-xs h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Target path: <code className="font-mono text-foreground font-semibold">{selectedDriveLetter}:\NAS_{selectedType === 'primary' ? 'Storage' : 'Archive'}</code>
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddStorageOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmAddStorage}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add Storage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
