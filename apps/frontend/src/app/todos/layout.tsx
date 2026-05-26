import type { ReactNode } from 'react';

import { SessionErrorGate } from '@/components/session-error-gate';

export default function ProtectedAppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionErrorGate>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </SessionErrorGate>
  );
}
