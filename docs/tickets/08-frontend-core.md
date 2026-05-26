# 08 — Frontend Core (`apps/frontend`)

**Phase:** 6
**Depends on:** 01 (monorepo)
**Unblocks:** 09, 10, 11

## Scope

Next.js 14 App Router scaffold, Tailwind + shadcn/ui, dark mode, base layout.

---

## T6.1 — Next.js bootstrap

### Bootstrap command

```bash
cd apps
pnpm create next-app@14 frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

After scaffold, edit `apps/frontend/package.json` name → `@app/frontend`.

### Folder structure (under `apps/frontend/src/`)

```
src/
  app/
    layout.tsx
    page.tsx                    # landing
    (auth)/
      login/page.tsx            # ticket 09
    app/                        # protected segment — ticket 09 middleware
      layout.tsx
      todos/page.tsx            # ticket 11
  components/
    ui/                         # shadcn primitives
    navbar.tsx
    theme-toggle.tsx
  lib/
    auth.ts                     # ticket 09
    api.ts                      # ticket 10
    queryKeys.ts                # ticket 10
    utils.ts                    # shadcn cn() helper
  hooks/
    useMe.ts                    # ticket 10
    useTodos.ts                 # ticket 10
  store/
    useTodoFiltersStore.ts      # ticket 10
  types/
    next-auth.d.ts              # ticket 09 (session augmentation)
```

### shadcn/ui init

```bash
cd apps/frontend
pnpm dlx shadcn@latest init
```

- Style: `default` (or `new-york`)
- Base color: pick one
- CSS variables: yes

Pre-install primitives needed for ticket 11:

```bash
pnpm dlx shadcn@latest add button input textarea select dialog sheet \
  card badge toast skeleton dropdown-menu form label
```

### tsconfig.json — workspace path

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@app/api-types": ["../../packages/api-types/dist/index.d.ts"]
    }
  }
}
```

### package.json scripts

```json
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

### Done when

- `pnpm --filter @app/frontend dev` starts on `:3000`
- `/` renders default page
- `shadcn` components import successfully

---

## T6.2 — Base layout + theming

### Files

- `src/app/layout.tsx`
- `src/components/theme-provider.tsx`
- `src/components/theme-toggle.tsx`
- `src/components/navbar.tsx`

### Dependencies

```bash
pnpm --filter @app/frontend add next-themes
```

### theme-provider.tsx

```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

### layout.tsx

```tsx
import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Navbar } from "@/components/navbar";

const inter = Inter({ subsets: ["latin"] });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Navbar />
          <main className="container mx-auto py-6">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

`Providers` wrapper (TanStack Query, Auth.js session) added in tickets 09 and 10 — wrap children inside `ThemeProvider`.

### navbar.tsx

Minimal: logo/title, theme toggle, login/account dropdown (placeholder until ticket 09).

### Done when

- Dark/light toggle persists across reloads
- Layout renders on `/` and (later) `/app/todos`
- No hydration warnings

---

## Frontend Dockerfile (ticket 02 referenced this)

### apps/frontend/Dockerfile

```dockerfile
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/api-types/package.json packages/api-types/
RUN pnpm install --frozen-lockfile

FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN pnpm --filter @app/api-types generate:types
RUN pnpm --filter @app/frontend build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/apps/frontend/.next/standalone ./
COPY --from=build /repo/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=build /repo/apps/frontend/public ./apps/frontend/public
EXPOSE 3000
CMD ["node", "apps/frontend/server.js"]
```

Requires `output: "standalone"` in `next.config.mjs`.

---

## Notes for executor

- Stick to Next.js 14 App Router (NOT pages router, NOT v15 if it lands)
- `src/` dir is mandatory — matches layout in plan
- Shadcn install creates `components.json`; commit it
- Do NOT add Auth.js or TanStack Query providers yet — tickets 09 and 10 own those
