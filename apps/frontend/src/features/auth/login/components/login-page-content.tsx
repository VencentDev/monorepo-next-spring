'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';

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

  return <LoginShell onSignIn={() => signIn('keycloak', { redirectTo: callbackUrl })} />;
}

function LoginShell({ onSignIn }: { onSignIn?: () => void }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-sm flex-col justify-center gap-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Use your Keycloak account to continue.</p>
      </div>
      <Button disabled={!onSignIn} onClick={onSignIn}>
        Continue with Keycloak
      </Button>
    </div>
  );
}
