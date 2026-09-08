'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, FolderPermission } from '@/lib/types';
import {
  getUsersAction,
  authenticateUserAction,
  logoutAction,
  switchUserAction,
  getSessionUserAction,
} from '@/lib/actions/users';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  userPermissions: FolderPermission[];
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchUser: (userId: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  isSuperadmin: boolean;
  isAdmin: boolean;
  isUser: boolean;
  canManageSystem: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load real authenticated session user from database on mount
  const refreshUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const sessionUser = await getSessionUserAction();

      if (sessionUser) {
        setCurrentUser(sessionUser);
        try {
          localStorage.setItem('homelab_active_user_id', sessionUser.id);
        } catch {}

        // Fetch users list for admins / account switcher
        const fetched = await getUsersAction();
        if (fetched && fetched.length > 0) {
          setUsers(fetched);
        }
      } else {
        // No valid session exists
        setCurrentUser(null);
        setUsers([]);
        try {
          localStorage.removeItem('homelab_active_user_id');
        } catch {}

        // If client is currently visiting a dashboard page, clear any stale cookie and redirect to login
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) {
          await logoutAction().catch(() => {});
          const callback = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `/login?callbackUrl=${callback}`;
        }
      }
    } catch (err) {
      console.error('[AuthProvider] Failed to fetch session user:', err);
      setCurrentUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  /**
   * Validates entered credentials with bcrypt on server and sets active session cookie.
   */
  const login = async (identifier: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      setIsLoading(true);
      const res = await authenticateUserAction(identifier, password);
      if (res.success && res.user) {
        setCurrentUser(res.user);
        try {
          localStorage.setItem('homelab_active_user_id', res.user.id);
        } catch {}
        const fetched = await getUsersAction();
        if (fetched) setUsers(fetched);
        return { success: true };
      }
      return { success: false, error: res.error || 'Invalid credentials.' };
    } catch {
      return { success: false, error: 'Authentication request failed.' };
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Logs out current session, deletes cookie, and redirects to /login.
   */
  const logout = async () => {
    try {
      await logoutAction();
    } catch (err) {
      console.error('[AuthProvider] Logout action error:', err);
    } finally {
      try {
        localStorage.removeItem('homelab_active_user_id');
      } catch {}
      setCurrentUser(null);
      setUsers([]);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  };

  /**
   * Switches active account by verifying user and reissuing session cookie.
   */
  const switchUser = async (userId: string) => {
    try {
      const res = await switchUserAction(userId);
      if (res.success && res.user) {
        setCurrentUser(res.user);
        try {
          localStorage.setItem('homelab_active_user_id', res.user.id);
        } catch {}
        const fetched = await getUsersAction();
        if (fetched) setUsers(fetched);
      }
    } catch (err) {
      console.error('[AuthProvider] Switch user error:', err);
    }
  };

  const isSuperadmin = currentUser?.role === UserRole.SUPERADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const isUser = currentUser?.role === UserRole.USER;
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
