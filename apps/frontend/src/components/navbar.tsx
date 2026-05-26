import Link from 'next/link';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export function Navbar() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-14 items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold">
          Todo App
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/todos">Todos</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/login">Login</Link>
          </Button>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
