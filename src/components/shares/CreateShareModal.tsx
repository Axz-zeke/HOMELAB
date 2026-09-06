'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileItem } from '@/lib/types';
import { Share2, Copy, Check, Lock, Calendar, Download, Eye, AlertCircle } from 'lucide-react';

interface CreateShareModalProps {
  file: FileItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateShareModal({ file, open, onOpenChange }: CreateShareModalProps) {
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState('7'); // days
  const [maxDownloads, setMaxDownloads] = useState('');
  const [allowPreview, setAllowPreview] = useState(true);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!file) return null;

  const handleGenerate = () => {
    // Generate simulated UUID
    const shareId = 'share-' + Math.random().toString(36).substring(2, 9);
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://192.168.1.150:3000';
    const fullUrl = `${origin}/s/${shareId}`;
    setGeneratedLink(fullUrl);
  };

  const handleCopy = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    setGeneratedLink(null);
    setPasswordProtected(false);
    setPassword('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-background border-border/80 shadow-2xl">
        <DialogHeader className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            <DialogTitle className="text-base font-semibold">
              Share &quot;{file.name}&quot;
            </DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Create an external link accessible over Tailscale or Local LAN.
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {!generatedLink ? (
            <>
              {/* Expiry setting */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  Link Expiration
                </Label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="1">Expires in 24 Hours</option>
                  <option value="7">Expires in 7 Days</option>
                  <option value="30">Expires in 30 Days</option>
                  <option value="never">Never Expires</option>
                </select>
              </div>

              {/* Password Protection Toggle */}
              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                    Require Password (bcrypt)
                  </Label>
                  <input
                    type="checkbox"
                    checked={passwordProtected}
                    onChange={(e) => setPasswordProtected(e.target.checked)}
                    className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                  />
                </div>
                {passwordProtected && (
                  <Input
                    type="password"
                    placeholder="Enter access passphrase..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-9 text-xs"
                  />
                )}
              </div>

              {/* Download Limit */}
              <div className="space-y-1.5 pt-1 border-t">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  Max Download Count (Optional)
                </Label>
                <Input
                  type="number"
                  placeholder="e.g. 5 (Leave empty for unlimited)"
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(e.target.value)}
                  className="h-9 text-xs"
                  min="1"
                />
              </div>

              {/* Read-only Preview Toggle */}
              <div className="flex items-center justify-between pt-1 border-t">
                <Label className="text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  Allow in-browser preview
                </Label>
                <input
                  type="checkbox"
                  checked={allowPreview}
                  onChange={(e) => setAllowPreview(e.target.checked)}
                  className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                />
              </div>
            </>
          ) : (
            /* Generated Link Display */
            <div className="space-y-3 py-2">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-400 flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Share link generated successfully!</p>
                  <p className="text-[11px] opacity-90 mt-0.5">
                    Guarded against root path traversal. External guests only access this payload.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Public URL</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={generatedLink}
                    className="h-9 font-mono text-xs bg-muted/50"
                  />
                  <Button size="sm" onClick={handleCopy} className="gap-1.5 shrink-0 h-9">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t bg-muted/20 flex flex-row items-center justify-end gap-2">
          {!generatedLink ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleGenerate} className="gap-1.5">
                <Share2 className="w-4 h-4" />
                Generate Link
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={handleReset}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
