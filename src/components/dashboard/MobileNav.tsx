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
  Server,
  User as UserIcon,
  Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function MobileNav() {
  const pathname = usePathname();
  const { currentUser, isSuperadmin, isAdmin, switchUser, users } = useAuth();

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between h-14 border-b px-4 bg-background/95 backdrop-blur-md sticky top-0 z-40">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Server className="w-4 h-4" />
          </div>
          <span className="font-bold tracking-tight text-sm">HOMELAB</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 ml-1" />
        </Link>

        <div className="flex items-center gap-2">
          {/* Active Role Indicator */}
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted border font-semibold">
            {currentUser.role}
          </span>

          {/* Quick Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-4 w-4" />
                <span className="sr-only">Menu</span>
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs">Switch Active Role</DropdownMenuLabel>
              {users.map((u) => (
                <DropdownMenuItem
                  key={u.id}
                  onClick={() => switchUser(u.id)}
                  className="text-xs flex justify-between"
                >
                  <span>{u.name} ({u.role})</span>
                  {u.id === currentUser.id && <span>✓</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs">Quick Links</DropdownMenuLabel>
              <DropdownMenuItem render={<Link href="/dashboard" />}>
                My Files
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/dashboard/shared" />}>
                Shared Folders
              </DropdownMenuItem>
              {(isSuperadmin || isAdmin) && (
                <>
                  <DropdownMenuItem render={<Link href="/dashboard/admin/drives" />}>
                    Drive Management
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/dashboard/admin/users" />}>
                    User Management
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/dashboard/admin/analytics" />}>
                    Analytics
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href="/dashboard/admin/audit-logs" />}>
                    Audit Logs
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar (PWA optimized) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t bg-background/95 backdrop-blur-lg px-2 flex items-center justify-around z-40 safe-area-bottom">
        <Link
          href="/dashboard"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors",
            pathname === '/dashboard' ? "text-primary" : "text-muted-foreground"
          )}
        >
          <Folder className="w-5 h-5 mb-0.5" />
          <span>Files</span>
        </Link>

        <Link
          href="/dashboard/shared"
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors",
            pathname?.startsWith('/dashboard/shared') ? "text-primary" : "text-muted-foreground"
          )}
        >
          <FolderKey className="w-5 h-5 mb-0.5" />
          <span>Shared</span>
        </Link>

        {(isSuperadmin || isAdmin) && (
          <Link
            href="/dashboard/admin/drives"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors",
              pathname?.startsWith('/dashboard/admin/drives') ? "text-primary" : "text-muted-foreground"
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
              "flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium transition-colors",
              pathname?.startsWith('/dashboard/admin/audit-logs') ? "text-primary" : "text-muted-foreground"
            )}
          >
            <ShieldCheck className="w-5 h-5 mb-0.5" />
            <span>Audit</span>
          </Link>
        )}

        {!(isSuperadmin || isAdmin) && (
          <div className="flex flex-col items-center justify-center flex-1 py-1 text-[11px] font-medium text-muted-foreground">
            <UserIcon className="w-5 h-5 mb-0.5 text-primary" />
            <span>{currentUser.name.split(' ')[0]}</span>
          </div>
        )}
      </div>
    </>
  );
}
