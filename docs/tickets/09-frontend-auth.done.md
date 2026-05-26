# 09 — Frontend Auth (Auth.js v5)

**Phase:** 7
**Depends on:** 02 (Keycloak running with `webapp` client), 08 (Next.js scaffold)
**Unblocks:** 10, 11

## Scope

Auth.js v5 with Keycloak provider (PKCE), token refresh, middleware-protected routes, RSC vs client fetch convention.

---

## T7.1 — Auth.js setup with Keycloak provider

### Install

```bash
pnpm --filter @app/frontend add next-auth@5 @auth/core
```

### Env vars (`.env.local`)

```
AUTH_SECRET=<generate via `openssl rand -base64 32`>
AUTH_KEYCLOAK_ID=webapp
AUTH_KEYCLOAK_SECRET=<empty for public client; required for confidential>
AUTH_KEYCLOAK_ISSUER=http://localhost:8081/realms/app
NEXT_PUBLIC_API_BASE=http://localhost:8080
```

### File: `src/lib/auth.ts`

```ts
import NextAuth from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID!,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET ?? '',
      issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
      authorization: { params: { scope: 'openid profile email' } },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = Math.floor(Date.now() / 1000) + (account.expires_in as number);
        return token;
      }
      if (Date.now() < (token.expiresAt as number) * 1000 - 30_000) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
});

async function refreshAccessToken(token: any) {
  try {
    const res = await fetch(`${process.env.AUTH_KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.AUTH_KEYCLOAK_ID!,
        client_secret: process.env.AUTH_KEYCLOAK_SECRET ?? '',
        refresh_token: token.refreshToken as string,
      }),
    });
    if (!res.ok) throw new Error('refresh_failed');
    const j = await res.json();
    return {
      ...token,
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + j.expires_in,
      error: undefined,
    };
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}
```

### File: `src/app/api/auth/[...nextauth]/route.ts`

```ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

### Session augmentation: `src/types/next-auth.d.ts`

```ts
import 'next-auth';
declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
  }
}
declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
```

### SessionProvider for client components

`src/components/session-provider.tsx`:

```tsx
'use client';
import { SessionProvider } from 'next-auth/react';
export { SessionProvider };
```

Wrap `app/layout.tsx` body subtree with `<SessionProvider>...</SessionProvider>` inside `ThemeProvider`.

### Done when

- `signIn("keycloak")` redirects to Keycloak login
- After login, `auth()` server-side returns valid session with `accessToken`
- Session persists across reloads

---

## T7.2 — Token refresh

Covered inline in `lib/auth.ts` above. Refresh fires when current time is within 30s of `expiresAt`. On failure, session carries `error: "RefreshAccessTokenError"` — UI surfaces this in ticket 11 (force re-login).

### Done when

- Wait for token's default expiry (Keycloak default 5 min)
- Next request silently refreshes; access token rotates
- Killing Keycloak then making a request → `session.error === "RefreshAccessTokenError"`

---

## T7.3 — Middleware + protected routes

### File: `apps/frontend/middleware.ts`

```ts
import { auth } from '@/lib/auth';

export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  const isProtected = pathname.startsWith('/app');
  if (isProtected && !req.auth) {
    const url = new URL('/api/auth/signin', req.url);
    url.searchParams.set('callbackUrl', req.url);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: ['/app/:path*'],
};
```

### Public pages

- `/` — landing (ticket 08)
- `/login` — optional custom page; if omitted, Auth.js default `/api/auth/signin` is used. Plan calls for `app/(auth)/login/page.tsx`:

```tsx
'use client';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-20">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <Button onClick={() => signIn('keycloak', { callbackUrl: '/app/todos' })}>
        Continue with Keycloak
      </Button>
    </div>
  );
}
```

### Callback page

Auth.js handles `/api/auth/callback/keycloak` automatically. No code needed unless customizing.

### Done when

- `localhost:3000/app/todos` (unauthenticated) → redirected to sign-in
- After login → lands on `/app/todos`

---

## T7.4 — Server actions vs client fetch convention

### Rule

- **RSC reads:** `const session = await auth();` → forward bearer to backend
- **Mutations:** server actions (preferred — no token in client bundle) OR client mutations using `useSession()` token

### Server action sample

```ts
// src/app/app/todos/actions.ts
'use server';
import { auth } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function createTodoAction(payload: { title: string; status: string }) {
  const session = await auth();
  if (!session?.accessToken) throw new Error('unauthorized');
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/v1/todos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`api_${res.status}`);
  revalidatePath('/app/todos');
  return res.json();
}
```

Ticket 10 wraps this fetch pattern into reusable `serverApi` / `clientApi` helpers.

### Done when

- RSC list page renders todos using bearer from `auth()` directly
- Creating via server action works without exposing token to browser

---

## Notes for executor

- Use Auth.js **v5** (`next-auth@5`) — v4 has different callback signatures
- Keycloak provider in v5 includes built-in PKCE for public clients — confirm in your installed version
- DO NOT store `accessToken` in `localStorage` — keep it in the Auth.js JWT (HTTP-only cookie under the hood)
- Refresh window: 30s before expiry. Tune if Keycloak access-token lifespan is unusually short
- `middleware.ts` lives at `apps/frontend/middleware.ts` (alongside `next.config.mjs`), NOT inside `src/`
