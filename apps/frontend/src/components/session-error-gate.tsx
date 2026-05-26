'use client';

import { signIn, useSession } from 'next-auth/react';
import { useEffect } from 'react';

import type { ReactNode } from 'react';

export function SessionErrorGate({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.error === 'RefreshAccessTokenError') {
      void signIn('keycloak');
    }
  }, [session?.error]);

  return <>{children}</>;
}
