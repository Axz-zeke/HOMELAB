'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Folder, 
  FolderKey, 
  HardDrive, 
  Users, 
  BarChart2, 
  ShieldCheck, 
  Settings, 
  CloudRain, 
  Sparkles, 
  Shield, 
  Smartphone,
  Server
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/lib/types';

export function Sidebar() {
  const pathname = usePathname();
  const { currentUser, isSuperadmin, isAdmin } = useAuth();

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

  const usedBytes = currentUser.used_bytes ?? currentUser.usedStorageBytes ?? 0;
  const quotaBytes = currentUser.storage_quota_bytes ?? currentUser.storageQuotaBytes;
  const quotaPercent = quotaBytes
    ? Math.min(Math.round((usedBytes / quotaBytes) * 100), 100)
    : 15; // default modest fill for unlimited

  const usedGB = (usedBytes / 1_073_741_824).toFixed(1);
  const quotaGB = quotaBytes
    ? (quotaBytes / 1_073_741_824).toFixed(0)
    : null;

  return (
    <aside className="w-64 border-r bg-card/60 backdrop-blur-xl flex flex-col hidden md:flex h-full shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between border-b px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 font-bold tracking-tight text-lg group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-primary/70 flex items-center justify-center text-primary-foreground shadow-sm shadow-primary/20 group-hover:scale-105 transition-transform">
            <Server className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="leading-tight font-extrabold tracking-tight">HOMELAB</span>
            <span className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">Personal Cloud</span>
          </div>
        </Link>
        <div className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" title="System Online (Dual-Mode)" />
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto py-5 px-3 space-y-6">
        {/* Core Storage Navigation */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all group",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                          : "hover:bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
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

        {/* Administration Section (Protected for Admin / Superadmin) */}
        {(isSuperadmin || isAdmin) && (
          <div>
            <div className="px-3 mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                        className={cn(
                          "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all group",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                            : "hover:bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon className={cn("h-4 w-4 transition-colors", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
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
        )}
      </div>

      {/* Storage Gauge & User Quota Widget */}
      <div className="p-3 m-3 rounded-xl bg-muted/40 border border-border/80">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            {quotaGB ? 'Storage Quota' : 'Global Pool'}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            {quotaGB ? `${quotaPercent}%` : 'Unlimited'}
          </span>
        </div>
        <div className="w-full bg-secondary/80 rounded-full h-2 overflow-hidden mb-2">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              quotaPercent > 85 ? "bg-destructive" : quotaPercent > 70 ? "bg-amber-500" : "bg-primary"
            )}
            style={{ width: `${Math.min(quotaPercent, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
          <span>{usedGB} GB used</span>
          <span>{quotaGB ? `${quotaGB} GB max` : 'Pooled'}</span>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="border-t p-3 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
              {(currentUser.username || currentUser.name).slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold leading-tight text-foreground truncate">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono truncate">
                @{currentUser.username || 'user'} • {currentUser.role}
              </span>
            </div>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Sign In / Switch Credentials"
          >
            <Smartphone className="w-4 h-4 text-emerald-500" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
