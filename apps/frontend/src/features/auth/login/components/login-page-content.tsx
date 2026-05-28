'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { authProviders } from '@/lib/auth-providers';

export function LoginPageContent() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/todos';

  return <LoginShell callbackUrl={callbackUrl} />;
}

function LoginShell({ callbackUrl }: { callbackUrl?: string }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-sm flex-col justify-center gap-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Use Google or GitHub to continue.</p>
      </div>
      <Button
        disabled={!callbackUrl}
        onClick={() => signIn(authProviders.google, { redirectTo: callbackUrl })}
      >
        Continue with Google
      </Button>
      <Button
        disabled={!callbackUrl}
        variant="outline"
        onClick={() => signIn(authProviders.github, { redirectTo: callbackUrl })}
      >
        Continue with GitHub
      </Button>
    </div>
  );
}
