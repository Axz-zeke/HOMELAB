'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SharePasswordForm({ shareId, error }: { shareId: string, error?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app we might want to do this via a POST action to set a secure cookie instead of URL param,
    // but URL parameter works perfectly for this offline-local architectural mock.
    router.push(`/s/${shareId}?p=${encodeURIComponent(password)}`);
  };

  return (
    <Card className="w-full max-w-md shadow-lg border-primary/10">
      <CardHeader className="text-center">
        <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-2xl">Protected Share</CardTitle>
        <CardDescription>This file has been securely locked by the owner.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Input 
              type="password" 
              placeholder="Enter password to decrypt" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="text-center text-lg"
            />
            {error && <p className="text-sm text-destructive font-medium text-center">{error}</p>}
          </div>
          <Button type="submit" className="w-full mt-2" size="lg">
            Unlock File
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
