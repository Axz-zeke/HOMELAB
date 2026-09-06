'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, FolderPermission } from '@/lib/types';
import { getUsersAction, authenticateUserAction } from '@/lib/actions/users';

interface AuthContextType {
  currentUser: User;
  users: User[];
  userPermissions: FolderPermission[];
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchUser: (userId: string) => void;
  refreshUsers: () => Promise<void>;
  isSuperadmin: boolean;
  isAdmin: boolean;
  isUser: boolean;
  canManageSystem: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initial fallback user before database read completes
const DEFAULT_FALLBACK_USER: User = {
  id: 'usr_superadmin',
  username: 'superadmin',
  email: 'superadmin@nas.local',
  name: 'Super Admin',
  role: UserRole.SUPERADMIN,
  home_directory_path: 'D:\\NAS_Storage\\user_homes\\superadmin',
  homePath: '/user_homes/superadmin',
  storage_quota_bytes: null,
  storageQuotaBytes: null,
  used_bytes: 0,
  usedStorageBytes: 0,
  isLocked: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date(),
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User>(DEFAULT_FALLBACK_USER);
  const [users, setUsers] = useState<User[]>([DEFAULT_FALLBACK_USER]);
  const [isLoading, setIsLoading] = useState(true);

  // Load real users from the dynamic database on mount
  const refreshUsers = useCallback(async () => {
    try {
      const fetched = await getUsersAction();
      if (fetched && fetched.length > 0) {
        setUsers(fetched);

        const savedUserId = typeof window !== 'undefined'
          ? localStorage.getItem('homelab_active_user_id')
          : null;

        if (savedUserId) {
          const matched = fetched.find((u) => u.id === savedUserId);
          if (matched) {
            setCurrentUser(matched);
            return;
          }
        }

        // Default to superadmin or first user if no valid stored session
        setCurrentUser((prev) => {
          const stillExists = fetched.find((u) => u.id === prev.id);
          return stillExists || fetched[0];
        });
      }
    } catch (err) {
      console.error('[AuthProvider] Failed to fetch users:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  /**
   * Validates entered credentials with bcrypt on server and sets active session.
   */
  const login = async (identifier: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authenticateUserAction(identifier, password);
      if (res.success && res.user) {
        setCurrentUser(res.user);
        try {
          localStorage.setItem('homelab_active_user_id', res.user.id);
        } catch {}
        // Refresh list to sync live quota
        refreshUsers();
        return { success: true };
      }
      return { success: false, error: res.error || 'Invalid credentials.' };
    } catch {
      return { success: false, error: 'Authentication request failed.' };
    }
  };

  /**
   * Logs out current session and switches back to Superadmin or redirects.
   */
  const logout = () => {
    try {
      localStorage.removeItem('homelab_active_user_id');
    } catch {}
    // If other users exist, reset to superadmin
    const superadmin = users.find((u) => u.role === UserRole.SUPERADMIN);
    if (superadmin) {
      setCurrentUser(superadmin);
    }
  };

  /**
   * Fast role / account switcher for convenience.
   */
  const switchUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (target) {
      setCurrentUser(target);
      try {
        localStorage.setItem('homelab_active_user_id', target.id);
      } catch {}
    }
  };

  const isSuperadmin = currentUser.role === UserRole.SUPERADMIN;
  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isUser = currentUser.role === UserRole.USER;
  const canManageSystem = isSuperadmin || isAdmin;

  // Standard user folder permissions
  const userPermissions: FolderPermission[] = [];

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        userPermissions,
        login,
        logout,
        switchUser,
        refreshUsers,
        isSuperadmin,
        isAdmin,
        isUser,
        canManageSystem,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
