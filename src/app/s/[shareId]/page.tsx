import { validateShareLink } from '@/lib/actions/share-links';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { File, Download, AlertCircle, Folder } from 'lucide-react';
import { SharePasswordForm } from '@/components/shares/SharePasswordForm';


export default async function PublicSharePage({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ shareId: string }>, 
  searchParams: Promise<{ p?: string }> 
}) {
  const { shareId } = await params;
  const { p } = await searchParams; 

  const validation = await validateShareLink(shareId, p);

  // Handle generic validation failures (expired, limits reached, not found)
  if (!validation.success && !validation.requiresPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-muted/20">
        <Card className="w-full max-w-md text-center shadow-lg border-destructive/20">
          <CardHeader>
            <div className="mx-auto bg-destructive/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Link Unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground font-medium">{validation.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle password prompt or invalid password
  if (validation.requiresPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-muted/20">
        <SharePasswordForm shareId={shareId} error={validation.error} />
      </div>
    );
  }

  const link = validation.shareLink!;
  const Icon = link.isFolder ? Folder : File;
  const filename = link.targetPath.split('/').pop() || (link.isFolder ? 'Shared Folder' : 'Shared File');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-muted/20">
      <div className="w-full max-w-md mb-8 text-center">
        <span className="font-bold text-2xl tracking-tight text-primary">NAS OS</span>
      </div>
      
      <Card className="w-full max-w-md shadow-xl border-primary/20">
        <CardHeader className="text-center pt-8">
          <div className="mx-auto bg-primary/10 w-24 h-24 rounded-2xl flex items-center justify-center mb-6 shadow-inner ring-1 ring-primary/20">
            <Icon className="w-12 h-12 text-primary" strokeWidth={1.5} />
          </div>
          <CardTitle className="text-2xl break-words leading-tight">
            {filename}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-3 font-medium">
            Securely shared with you
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-8">
          <a
            href={`/api/download?path=${encodeURIComponent(link.targetPath.replace(/^\//, ''))}`}
            download={filename}
            className="inline-flex items-center justify-center w-full h-12 text-base font-medium rounded-md bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg transition-all gap-2"
          >
            <Download className="w-5 h-5" />
            Download {link.isFolder ? 'Archive (.zip)' : 'File'}
          </a>
          
          {link.allowPreview && !link.isFolder && (
            <a
              href={`/api/stream?path=${encodeURIComponent(link.targetPath.replace(/^\//, ''))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full h-12 text-base font-medium rounded-md border border-input bg-background hover:bg-muted transition-colors gap-2"
            >
              Preview in Browser
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
