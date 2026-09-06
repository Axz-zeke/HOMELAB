'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, UserRole, FolderPermission } from '@/lib/types';
import {
  getUsersAction,
  createUserAction,
  resetUserPasswordAction,
  updateUserQuotaAction,
  deleteUserAction,
} from '@/lib/actions/users';
import {
  Users,
  UserPlus,
  Shield,
  FolderLock,
  Lock,
  Edit2,
  Trash2,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  RefreshCw,
  FolderCheck
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create User Modal
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.USER);
  const [newUserQuotaGB, setNewUserQuotaGB] = useState('50');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Edit Quota Modal
  const [editQuotaUser, setEditQuotaUser] = useState<User | null>(null);
  const [editQuotaGB, setEditQuotaGB] = useState('');
  const [isSubmittingQuota, setIsSubmittingQuota] = useState(false);

  // Reset Password Modal
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  // Load real users from dynamic database
  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const fetched = await getUsersAction();
      setUsers(fetched);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to load users from database.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Automatically auto-suggest username from email or name
  const handleEmailChange = (val: string) => {
    setNewUserEmail(val);
    if (!newUserUsername && val.includes('@')) {
      const suggested = val.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      setNewUserUsername(suggested);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserUsername.trim() || !newUserEmail.trim()) {
      setStatusMessage({ type: 'error', text: 'Name, username, and email are required.' });
      return;
    }
    if (!newUserPassword || newUserPassword.length < 4) {
      setStatusMessage({ type: 'error', text: 'Password must be at least 4 characters long.' });
      return;
    }

    setIsSubmittingCreate(true);
    setStatusMessage(null);

    const quotaBytes = newUserQuotaGB === 'unlimited' || !newUserQuotaGB
      ? null
      : parseFloat(newUserQuotaGB) * 1024 * 1024 * 1024;

    const res = await createUserAction({
      name: newUserName.trim(),
      username: newUserUsername.trim(),
      email: newUserEmail.trim(),
      password: newUserPassword,
      role: newUserRole,
      storageQuotaBytes: quotaBytes,
    });

    setIsSubmittingCreate(false);

    if (res.success && res.user) {
      setStatusMessage({
        type: 'success',
        text: `User '${res.user.username}' created with physical home directory provisioned at ${res.user.home_directory_path}.`,
      });
      setCreateUserOpen(false);
      setNewUserName('');
      setNewUserUsername('');
      setNewUserEmail('');
      setNewUserPassword('');
      loadUsers();
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Failed to create user.' });
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (user.role === UserRole.SUPERADMIN || user.isLocked || user.is_locked) {
      alert('Superadmin accounts are protected by immutable security lock and cannot be deleted.');
      return;
    }

    if (!confirm(`Are you sure you want to delete user '${user.username}' (${user.email})?`)) {
      return;
    }

    const res = await deleteUserAction(user.id);
    if (res.success) {
      setStatusMessage({ type: 'success', text: `User '${user.username}' was deleted.` });
      loadUsers();
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Failed to delete user.' });
    }
  };

  const handleSaveQuota = async () => {
    if (!editQuotaUser) return;
    setIsSubmittingQuota(true);

    const newBytes = editQuotaGB === 'unlimited' || !editQuotaGB
      ? null
      : parseFloat(editQuotaGB) * 1024 * 1024 * 1024;

    const res = await updateUserQuotaAction(editQuotaUser.id, newBytes);
    setIsSubmittingQuota(false);

    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: `Storage quota for '${editQuotaUser.username}' updated to ${newBytes ? `${(newBytes / 1e9).toFixed(0)} GB` : 'Unlimited'}.`,
      });
      setEditQuotaUser(null);
      loadUsers();
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Failed to update quota.' });
    }
  };

  const handleSavePasswordReset = async () => {
    if (!resetPasswordUser) return;
    if (!newPassword || newPassword.length < 4) {
      alert('Password must be at least 4 characters long.');
      return;
    }

    setIsSubmittingPassword(true);
    const res = await resetUserPasswordAction(resetPasswordUser.id, newPassword);
    setIsSubmittingPassword(false);

    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: `Password for '${resetPasswordUser.username}' was successfully reset with bcrypt hashing.`,
      });
      setResetPasswordUser(null);
      setNewPassword('');
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Failed to reset password.' });
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Status banner */}
      {statusMessage && (
        <div
          className={`flex items-center justify-between p-4 rounded-lg border text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/20 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <Button variant="ghost" size="xs" onClick={() => setStatusMessage(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">User & Workspace Management</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Dynamic database records with bcrypt password authentication and automated physical workspace provisioning.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={isLoading} className="gap-2 shadow-xs">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setCreateUserOpen(true)} className="gap-2 shadow-xs">
            <UserPlus className="w-4 h-4" />
            Create Account
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <Card className="border-border/80 shadow-xs">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Live User Accounts & Storage Quotas</CardTitle>
              <CardDescription className="text-xs">
                All records query the live database with real-time physical disk size scans of their home directories.
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              {users.length} Account{users.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User / Credentials</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Physical Workspace Path</TableHead>
                <TableHead>Disk Usage / Quota</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Scanning database and calculating disk usage...
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const usedBytes = user.used_bytes ?? user.usedStorageBytes ?? 0;
                  const quotaBytes = user.storage_quota_bytes ?? user.storageQuotaBytes;
                  const usedFormatted = formatBytes(usedBytes);
                  const quotaFormatted = quotaBytes ? formatBytes(quotaBytes) : 'Unlimited';
                  const percent = quotaBytes && quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;
                  const isSuperadmin = user.role === UserRole.SUPERADMIN || user.isLocked || user.is_locked;

                  return (
                    <TableRow key={user.id} className="hover:bg-muted/40">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs text-primary">
                            {(user.username || user.name).slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm">{user.name}</span>
                              {isSuperadmin && (
                                <span title="Superadmin Lock Protected">
                                  <Lock className="w-3.5 h-3.5 text-amber-500" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono text-foreground/80">@{user.username}</span>
                              <span>•</span>
                              <span>{user.email}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={user.role === UserRole.SUPERADMIN ? 'default' : user.role === UserRole.ADMIN ? 'secondary' : 'outline'}
                          className="font-mono text-[10px]"
                        >
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                          <FolderCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate max-w-xs" title={user.home_directory_path}>
                            {user.home_directory_path || `D:\\NAS_Storage\\user_homes\\${user.username}`}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 max-w-xs">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono text-muted-foreground">{usedFormatted}</span>
                            <span className="font-mono font-medium text-foreground">
                              {quotaBytes ? `${quotaFormatted} (${percent}%)` : 'Unlimited'}
                            </span>
                          </div>
                          {quotaBytes && (
                            <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${percent > 85 ? 'bg-destructive' : 'bg-primary'}`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setEditQuotaUser(user);
                              setEditQuotaGB(quotaBytes ? (quotaBytes / (1024 * 1024 * 1024)).toString() : 'unlimited');
                            }}
                            className="h-8 text-xs gap-1"
                            title="Adjust Storage Quota"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Quota
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setResetPasswordUser(user);
                              setNewPassword('');
                            }}
                            className="h-8 text-xs gap-1"
                            title="Reset User Password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            Password
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleDeleteUser(user)}
                            disabled={isSuperadmin}
                            className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                            title={isSuperadmin ? 'Superadmin accounts cannot be deleted' : 'Delete user'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create User Modal with automated workspace provisioning & password */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Local NAS Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Full Name</Label>
              <Input
                placeholder="e.g. John Doe"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email Address</Label>
              <Input
                type="email"
                placeholder="e.g. john@nas.local"
                value={newUserEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Username (Workspace Identifier)</Label>
              <Input
                placeholder="e.g. jdoe or user1"
                value={newUserUsername}
                onChange={(e) => setNewUserUsername(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground font-mono">
                Automated Disk Path: <strong>D:\NAS_Storage\user_homes\{newUserUsername || '{username}'}</strong>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Password (Hashed via bcrypt)</Label>
              <div className="relative">
                <Input
                  type={showCreatePassword ? 'text' : 'password'}
                  placeholder="Set initial password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePassword(!showCreatePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">RBAC Role</Label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value={UserRole.USER}>User (Restricted to Personal Home Directory)</option>
                <option value={UserRole.ADMIN}>Admin (Shared Storage & Scoped Controls)</option>
                <option value={UserRole.SUPERADMIN}>Superadmin (Full Hardware & Root Control)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Storage Quota Limit (GB)</Label>
              <Input
                placeholder="e.g., 100 or 'unlimited'"
                value={newUserQuotaGB}
                onChange={(e) => setNewUserQuotaGB(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreateUserOpen(false)} disabled={isSubmittingCreate}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateUser} disabled={isSubmittingCreate}>
              {isSubmittingCreate ? 'Provisioning Workspace...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Quota Modal */}
      <Dialog open={!!editQuotaUser} onOpenChange={(open) => !open && setEditQuotaUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Storage Quota</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Configure maximum quota for <strong>{editQuotaUser?.name} (@{editQuotaUser?.username})</strong>. Type &quot;unlimited&quot; or leave empty for no limit.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Quota in Gigabytes (GB)</Label>
              <Input
                placeholder="e.g., 100 or unlimited"
                value={editQuotaGB}
                onChange={(e) => setEditQuotaGB(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setEditQuotaUser(null)} disabled={isSubmittingQuota}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveQuota} disabled={isSubmittingQuota}>
              {isSubmittingQuota ? 'Saving...' : 'Save Quota'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={!!resetPasswordUser} onOpenChange={(open) => !open && setResetPasswordUser(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Enter a new password for <strong>{resetPasswordUser?.name} (@{resetPasswordUser?.username})</strong>. It will be securely hashed with bcrypt.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">New Password</Label>
              <div className="relative">
                <Input
                  type={showResetPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword(!showResetPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setResetPasswordUser(null)} disabled={isSubmittingPassword}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSavePasswordReset} disabled={isSubmittingPassword}>
              {isSubmittingPassword ? 'Hashing & Saving...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
