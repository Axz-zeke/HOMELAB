'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Folder, 
  FolderKey, 
  HardDrive, 
  Users, 
  BarChart2, 
  ShieldCheck, 
  Server,
  User as UserIcon,
  Menu,
  X,
  Settings,
  Shield,
  Smartphone,
  Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function MobileNav() {
  const pathname = usePathname();
  const { currentUser, isSuperadmin, isAdmin, switchUser, users } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const navItems = [
    { 
      name: 'My Files', 
      href: '/dashboard', 
      icon: Folder, 
      roles: [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER],
      badge: 'Scoped'
    },
    { 
      name: 'Shared with Me', 
      href: '/dashboard/shared', 
      icon: FolderKey, 
      roles: [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER] 
    },
    { 
      name: 'Drive Management', 
      href: '/dashboard/admin/drives', 
      icon: HardDrive, 
      roles: [UserRole.SUPERADMIN, UserRole.ADMIN],
      badge: 'Disks'
    },
    { 
      name: 'User Management', 
      href: '/dashboard/admin/users', 
      icon: Users, 
      roles: [UserRole.SUPERADMIN, UserRole.ADMIN] 
    },
    { 
      name: 'Analytics', 
      href: '/dashboard/admin/analytics', 
      icon: BarChart2, 
      roles: [UserRole.SUPERADMIN, UserRole.ADMIN] 
    },
    { 
      name: 'Audit Logs', 
      href: '/dashboard/admin/audit-logs', 
      icon: ShieldCheck, 
      roles: [UserRole.SUPERADMIN, UserRole.ADMIN] 
    },
    { 
      name: 'System Settings', 
      href: '/dashboard/admin/settings', 
      icon: Settings, 
      roles: [UserRole.SUPERADMIN],
      badge: 'Super'
    },
  ];

  if (!currentUser) {
    return (
      <div className="md:hidden flex items-center justify-between h-14 border-b px-3 sm:px-4 bg-background/95 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/40 animate-pulse" />
          <span className="font-bold tracking-tight text-sm">HOMELAB</span>
        </div>
      </div>
    );
  }

  const usedBytes = currentUser.used_bytes ?? currentUser.usedStorageBytes ?? 0;
  const quotaBytes = currentUser.storage_quota_bytes ?? currentUser.storageQuotaBytes;
  const quotaPercent = quotaBytes
    ? Math.min(Math.round((usedBytes / quotaBytes) * 100), 100)
    : 15;

  const usedGB = (usedBytes / 1_073_741_824).toFixed(1);
  const quotaGB = quotaBytes
    ? (quotaBytes / 1_073_741_824).toFixed(0)
    : null;

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between h-14 border-b px-3 sm:px-4 bg-background/95 backdrop-blur-md sticky top-0 z-40">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
            <Server className="w-4 h-4" />
          </div>
          <span className="font-bold tracking-tight text-sm">HOMELAB</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 ml-0.5" />
        </Link>

        <div className="flex items-center gap-2">
          {/* Active Role Indicator */}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted border font-semibold">
            {currentUser.role}
          </span>

          {/* Slide-over Drawer Trigger Button (min 44px touch target) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDrawerOpen(true)}
            className="min-h-[44px] min-w-[44px] p-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="Open Mobile Navigation Menu"
          >
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open Navigation</span>
          </Button>
        </div>
      </div>

      {/* Slide-over Mobile Navigation Drawer / Sheet */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Overlay */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-200"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Slide-over Sheet Panel */}
          <div className="relative w-80 max-w-[85vw] h-full bg-card border-r border-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-200 select-none">
            {/* Drawer Header */}
            <div className="h-16 flex items-center justify-between border-b px-4 shrink-0 bg-muted/20">
              <Link
                href="/dashboard"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center gap-2.5 font-bold tracking-tight text-base"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-primary/70 flex items-center justify-center text-primary-foreground shadow-sm shadow-primary/20">
                  <Server className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="leading-tight font-extrabold tracking-tight">HOMELAB</span>
                  <span className="text-[9px] text-muted-foreground font-mono tracking-widest uppercase">Mobile Console</span>
                </div>
              </Link>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDrawerOpen(false)}
                className="min-h-[44px] min-w-[44px] p-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                title="Close Navigation"
              >
                <X className="w-5 h-5" />
                <span className="sr-only">Close</span>
              </Button>
            </div>

            {/* Navigation Items (Scrollable with min 44px targets) */}
            <div className="flex-1 overflow-y-auto p-3 space-y-5">
              {/* Storage & Files Section */}
              <div>
                <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Storage & Files
                </div>
                <ul className="space-y-1">
                  {navItems
                    .filter((item) => item.roles.includes(currentUser.role) && ['My Files', 'Shared with Me'].includes(item.name))
                    .map((item) => {
                      const isActive = item.href === '/dashboard' 
                        ? pathname === '/dashboard' 
                        : pathname?.startsWith(item.href);
                      return (
                        <li key={item.name}>
                          <Link
                            href={item.href}
                            onClick={() => setIsDrawerOpen(false)}
                            className={cn(
                              "min-h-[44px] flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all",
                              isActive
                                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                                : "hover:bg-muted text-muted-foreground hover:text-foreground active:bg-muted"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <item.icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                              <span>{item.name}</span>
                            </div>
                            {item.badge && (
                              <span className={cn(
                                "text-[10px] px-1.5 py-0.5 rounded font-mono font-normal",
                                isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                              )}>
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </div>

              {/* Administration Section */}
              {(isSuperadmin || isAdmin) && (
                <div>
                  <div className="px-3 mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <span>Administration</span>
                    <Shield className="w-3 h-3 text-primary" />
                  </div>
                  <ul className="space-y-1">
                    {navItems
                      .filter((item) => item.roles.includes(currentUser.role) && !['My Files', 'Shared with Me'].includes(item.name))
                      .map((item) => {
                        const isActive = pathname?.startsWith(item.href);
                        return (
                          <li key={item.name}>
                            <Link
                              href={item.href}
                              onClick={() => setIsDrawerOpen(false)}
                              className={cn(
                                "min-h-[44px] flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all",
                                isActive
                                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                                  : "hover:bg-muted text-muted-foreground hover:text-foreground active:bg-muted"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <item.icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                                <span>{item.name}</span>
                              </div>
                              {item.badge && (
                                <span className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded font-mono font-normal",
                                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                                )}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}

              {/* Role Switcher in Drawer */}
              <div>
                <div className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Switch Active Account
                </div>
                <div className="space-y-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u.id);
                        setIsDrawerOpen(false);
                      }}
                      className={cn(
                        "w-full min-h-[44px] flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors",
                        u.id === currentUser.id
                          ? "bg-primary/10 border border-primary/20 text-primary"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <UserIcon className="w-4 h-4" />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-foreground leading-tight">{u.name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">@{u.username} • {u.role}</span>
                        </div>
                      </div>
                      {u.id === currentUser.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Storage Gauge & User Profile Footer */}
            <div className="p-3 border-t bg-muted/20 space-y-3 shrink-0">
              <div className="p-2.5 rounded-xl bg-muted/40 border border-border/80">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-primary" />
                    {quotaGB ? 'Storage Quota' : 'Global Pool'}
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {quotaGB ? `${quotaPercent}%` : 'Unlimited'}
                  </span>
                </div>
                <div className="w-full bg-secondary/80 rounded-full h-1.5 overflow-hidden mb-1.5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      quotaPercent > 85 ? "bg-destructive" : quotaPercent > 70 ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ width: `${Math.min(quotaPercent, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                  <span>{usedGB} GB used</span>
                  <span>{quotaGB ? `${quotaGB} GB max` : 'Pooled'}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                    {(currentUser.username || currentUser.name).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold leading-tight text-foreground truncate">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono truncate">
                      {currentUser.role}
                    </span>
                  </div>
                </div>
                <Link
                  href="/login"
                  onClick={() => setIsDrawerOpen(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Sign In"
                >
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (PWA optimized, min 44px touch targets) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t bg-background/95 backdrop-blur-lg px-2 flex items-center justify-around z-40 safe-area-bottom">
        <Link
          href="/dashboard"
          className={cn(
            "min-h-[44px] flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors",
            pathname === '/dashboard' ? "text-primary font-semibold" : "text-muted-foreground"
          )}
        >
          <Folder className="w-5 h-5 mb-0.5" />
          <span>Files</span>
        </Link>

        <Link
          href="/dashboard/shared"
          className={cn(
            "min-h-[44px] flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors",
            pathname?.startsWith('/dashboard/shared') ? "text-primary font-semibold" : "text-muted-foreground"
          )}
        >
          <FolderKey className="w-5 h-5 mb-0.5" />
          <span>Shared</span>
        </Link>

        {(isSuperadmin || isAdmin) && (
          <Link
            href="/dashboard/admin/drives"
            className={cn(
              "min-h-[44px] flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors",
              pathname?.startsWith('/dashboard/admin/drives') ? "text-primary font-semibold" : "text-muted-foreground"
            )}
          >
            <HardDrive className="w-5 h-5 mb-0.5" />
            <span>Drives</span>
          </Link>
        )}

        {(isSuperadmin || isAdmin) && (
          <Link
            href="/dashboard/admin/audit-logs"
            className={cn(
              "min-h-[44px] flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors",
              pathname?.startsWith('/dashboard/admin/audit-logs') ? "text-primary font-semibold" : "text-muted-foreground"
            )}
          >
            <ShieldCheck className="w-5 h-5 mb-0.5" />
            <span>Audit</span>
          </Link>
        )}

        {!(isSuperadmin || isAdmin) && (
          <div className="min-h-[44px] flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium text-muted-foreground">
            <UserIcon className="w-5 h-5 mb-0.5 text-primary" />
            <span>{currentUser.name.split(' ')[0]}</span>
          </div>
        )}
      </div>
    </>
  );
}
