import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-sm flex-col justify-center gap-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Authentication is added in ticket 09.</p>
      </div>
      <Button disabled>Continue with Keycloak</Button>
    </div>
  );
}
