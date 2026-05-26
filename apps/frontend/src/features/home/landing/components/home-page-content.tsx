import Link from 'next/link';

import { Button } from '@/components/ui/button';

export function HomePageContent() {
  return (
    <section className="grid min-h-[calc(100vh-9rem)] content-center gap-6">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm font-medium text-muted-foreground">Frontend core</p>
        <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">Todo workspace</h1>
        <p className="max-w-xl text-base leading-7 text-muted-foreground">
          The Next.js app shell is ready for authentication, typed API access, and the todo
          workflow.
        </p>
        <Button asChild>
          <Link href="/todos">Open app</Link>
        </Button>
      </div>
    </section>
  );
}
