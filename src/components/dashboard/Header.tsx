'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { getNetworkSettingsAction, NetworkSettings } from '@/lib/actions/network';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlobalSearchDialog } from '@/components/dashboard/GlobalSearchDialog';
import { 
  Search, 
  Wifi, 
  ShieldCheck, 
  HardDrive, 
  ChevronDown, 
  User as UserIcon,
  Laptop,
  CheckCircle2,
  Lock
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Header() {
  const { currentUser, users, switchUser } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [networkSettings, setNetworkSettings] = useState<NetworkSettings | null>(null);
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);

  useEffect(() => {
    getNetworkSettingsAction().then(setNetworkSettings);
  }, []);

  if (!currentUser) {
    return (
      <header className="h-16 border-b bg-background/95 backdrop-blur-md px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
        <div className="h-9 bg-muted/60 rounded-md w-48 animate-pulse" />
        <div className="h-9 bg-muted/60 rounded-md w-32 animate-pulse" />
      </header>
    );
  }

  return (
    <>
      <header className="h-16 border-b bg-background/95 backdrop-blur-md px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
        {/* Left: Quick Search Button */}
        <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-md">
          <Button
            variant="outline"
            onClick={() => setSearchOpen(true)}
            className="w-full justify-between text-muted-foreground bg-muted/40 hover:bg-muted font-normal h-9 min-h-[40px] border-border/70 text-xs px-2.5 sm:px-3"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-xs sm:text-sm truncate">Search scoped files...</span>
            </span>
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
        </div>

        {/* Right: Network Status, Quota, Role Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Mobile Network & Pool Drawer Toggle Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsMobileDetailsOpen((prev) => !prev)}
            className="lg:hidden min-h-[40px] px-2 sm:px-2.5 gap-1 text-xs border-border/80 flex items-center justify-center"
            title="Toggle Network & Storage Status"
          >
            <span className="relative flex h-2 w-2 mr-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${isMobileDetailsOpen ? 'rotate-180' : ''}`} />
          </Button>

          {/* Dual-Mode Network Status Badge (Desktop) */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
            <span className="relative flex h-2 w-2">
              {networkSettings?.tailscaleIp ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              )}
            </span>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Tailnet:</span>
            <span className="font-mono text-[11px]">{networkSettings?.tailscaleIp || 'Not Configured'}</span>
            <span className="text-muted-foreground font-normal">|</span>
            <Wifi className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">LAN:</span>
            <span className="font-mono text-[11px]">{networkSettings ? `Port ${networkSettings.lanPort || '3000'}` : 'Not Configured'}</span>
          </div>

          {/* Quick Storage Quota Meter Pill (Desktop) */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/60 border text-xs text-muted-foreground">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            <span>
              {(currentUser.storage_quota_bytes ?? currentUser.storageQuotaBytes) === null ||
              (currentUser.storage_quota_bytes ?? currentUser.storageQuotaBytes) === undefined ? (
                <span className="font-medium text-foreground">Quota: Unlimited</span>
              ) : (
                <span>
                  <strong className="text-foreground">
                    {(((currentUser.used_bytes ?? currentUser.usedStorageBytes ?? 0) / (1024 * 1024 * 1024))).toFixed(1)} GB
                  </strong>{' '}
                  / {(((currentUser.storage_quota_bytes ?? currentUser.storageQuotaBytes ?? 0) / (1024 * 1024 * 1024))).toFixed(0)} GB
                </span>
              )}
            </span>
          </div>

          {/* Role & User Switcher (Interactive for Demo / Testing) */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="outline" size="sm" className="gap-1.5 sm:gap-2 h-9 min-h-[40px] px-2 sm:px-3 border-border/80">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                  {(currentUser.username || currentUser.name).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex flex-col text-left leading-none hidden sm:block">
                  <span className="text-xs font-semibold">{currentUser.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">@{currentUser.username || 'user'} • {currentUser.role}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Active User & Scoped Workspace
              </DropdownMenuLabel>
              <div className="px-2 py-1.5 text-xs bg-muted/50 rounded-md mb-2">
                <p className="font-semibold text-foreground">{currentUser.name}</p>
                <p className="text-muted-foreground truncate">{currentUser.email}</p>
                <p className="font-mono text-[10px] text-muted-foreground mt-1 truncate" title={currentUser.home_directory_path}>
                  {currentUser.home_directory_path || `D:\\NAS_Storage\\user_homes\\${currentUser.username}`}
                </p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                    {currentUser.role}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {currentUser.role === 'SUPERADMIN' ? 'Full Hardware & FS' : 'Personal Home Scope'}
                  </span>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Switch Local Account:
              </DropdownMenuLabel>
              {users.map((u) => (
                <DropdownMenuItem
                  key={u.id}
                  onClick={() => switchUser(u.id)}
                  className="flex items-center justify-between cursor-pointer py-2"
                >
                  <div className="flex items-center gap-2">
                    <UserIcon className="w-4 h-4 text-muted-foreground" />
                    <div className="flex flex-col text-xs">
                      <span className="font-medium text-foreground">{u.name}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">@{u.username} ({u.role})</span>
                    </div>
                  </div>
                  {u.id === currentUser.id && (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  window.location.href = '/login';
                }}
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground py-2"
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  <span>Sign In with Password</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Mobile Collapsible Network & Storage Drawer */}
      {isMobileDetailsOpen && (
        <div className="lg:hidden border-b bg-card/95 backdrop-blur-md px-4 py-2.5 space-y-2 text-xs animate-in slide-in-from-top-2 duration-150 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Tailnet:</span>
              <span className="font-mono text-[11px] font-semibold">{networkSettings?.tailscaleIp || 'Not Configured'}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/70 border text-muted-foreground">
              <Wifi className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-[11px]">Port {networkSettings?.lanPort || '3000'}</span>
            </div>
          </div>

          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 border border-border/60 text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <HardDrive className="w-3.5 h-3.5 text-primary" />
              <span>Disk Pool Storage</span>
            </span>
            <span className="font-mono text-[11px]">
              {(currentUser.storage_quota_bytes ?? currentUser.storageQuotaBytes) === null ||
              (currentUser.storage_quota_bytes ?? currentUser.storageQuotaBytes) === undefined ? (
                <strong className="text-emerald-500">Unlimited Quota</strong>
              ) : (
                <span>
                  <strong className="text-foreground">
                    {(((currentUser.used_bytes ?? currentUser.usedStorageBytes ?? 0) / (1024 * 1024 * 1024))).toFixed(1)} GB
                  </strong>{' '}
                  / {(((currentUser.storage_quota_bytes ?? currentUser.storageQuotaBytes ?? 0) / (1024 * 1024 * 1024))).toFixed(0)} GB
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Global Search Dialog */}
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
