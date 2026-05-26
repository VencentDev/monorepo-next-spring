# 10 — Frontend API Client + State

**Phase:** 8
**Depends on:** 07 (types), 09 (auth/session)
**Unblocks:** 11

## Scope

Typed `apiFetch` (server + client flavors), TanStack Query setup, per-resource hooks, Zustand UI state.

State layering rule (locked):
- **Server state →** TanStack Query
- **Session/auth →** Auth.js
- **Ephemeral UI state →** Zustand
- No overlap.

---

## T8.1 — Typed fetch wrapper

### Install

```bash
pnpm --filter @app/frontend add @tanstack/react-query @tanstack/react-query-devtools zustand
```

### File: `src/lib/api.ts`

```ts
import type { paths } from "@app/api-types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(public status: number, public payload: unknown, message: string) {
    super(message);
  }
}

async function apiFetch<T>(token: string | undefined, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    let payload: unknown = undefined;
    try { payload = await res.json(); } catch {}
    throw new ApiError(res.status, payload, `api_${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// SERVER — uses auth() from server context
export async function serverApi<T>(path: string, init?: RequestInit): Promise<T> {
  const { auth } = await import("@/lib/auth");
  const session = await auth();
  return apiFetch<T>(session?.accessToken, path, init);
}

// CLIENT — accepts token from useSession() / session prop
export async function clientApi<T>(token: string | undefined, path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(token, path, init);
}

// Type helper
export type Paths = paths;
```

### Done when

- `serverApi<UserResponse>("/api/v1/users/me")` works from RSC
- `clientApi` works from client components when given a token

---

## T8.2 — TanStack Query setup

### File: `src/components/providers.tsx`

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }));
  return (
    <SessionProvider>
      <QueryClientProvider client={client}>
        {children}
        {process.env.NODE_ENV === "development" && <ReactQueryDevtools />}
      </QueryClientProvider>
    </SessionProvider>
  );
}
```

Wire into `app/layout.tsx` inside `<ThemeProvider>`:

```tsx
<ThemeProvider ...>
  <Providers>
    <Navbar />
    <main>{children}</main>
  </Providers>
</ThemeProvider>
```

### File: `src/lib/queryKeys.ts`

```ts
export const qk = {
  me: () => ["me"] as const,
  todos: {
    all: () => ["todos"] as const,
    list: (filters: { status?: string; page?: number }) =>
      ["todos", "list", filters] as const,
    detail: (id: string) => ["todos", "detail", id] as const,
  },
};
```

### Done when

- React Query devtools render in dev
- Query keys factory used by all hooks (no inline string arrays)

---

## T8.3 — Generated hooks

### File: `src/hooks/useMe.ts`

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { clientApi } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { paths } from "@app/api-types";

type Me = paths["/api/v1/users/me"]["get"]["responses"]["200"]["content"]["application/json"];

export function useMe() {
  const { data: session } = useSession();
  return useQuery({
    queryKey: qk.me(),
    queryFn: () => clientApi<Me>(session?.accessToken, "/api/v1/users/me"),
    enabled: !!session?.accessToken,
  });
}
```

### File: `src/hooks/useTodos.ts`

```ts
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { clientApi } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { paths } from "@app/api-types";

type ListResp = paths["/api/v1/todos"]["get"]["responses"]["200"]["content"]["application/json"];
type CreateBody = paths["/api/v1/todos"]["post"]["requestBody"]["content"]["application/json"];
type UpdateBody = paths["/api/v1/todos/{id}"]["patch"]["requestBody"]["content"]["application/json"];
type Todo = ListResp["content"][number];

export function useTodos(filters: { status?: string; page?: number } = {}) {
  const { data: session } = useSession();
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.page !== undefined) params.set("page", String(filters.page));
  return useQuery({
    queryKey: qk.todos.list(filters),
    queryFn: () => clientApi<ListResp>(session?.accessToken, `/api/v1/todos?${params}`),
    enabled: !!session?.accessToken,
  });
}

export function useCreateTodo() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBody) =>
      clientApi<Todo>(session?.accessToken, "/api/v1/todos", {
        method: "POST", body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.todos.all() }),
  });
}

export function useUpdateTodo() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBody }) =>
      clientApi<Todo>(session?.accessToken, `/api/v1/todos/${id}`, {
        method: "PATCH", body: JSON.stringify(body),
      }),
    onMutate: async ({ id, body }) => {
      // Optimistic update — see ticket 11
      await qc.cancelQueries({ queryKey: qk.todos.all() });
      const previous = qc.getQueriesData({ queryKey: qk.todos.all() });
      // ... patch cached lists
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      ctx?.previous.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.todos.all() }),
  });
}

export function useDeleteTodo() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      clientApi<void>(session?.accessToken, `/api/v1/todos/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.todos.all() }),
  });
}
```

### Done when

- `useTodos({ status: "TODO" })` returns typed data
- All hooks compile against `@app/api-types`
- Mutations invalidate queries on success

---

## T8.4 — Zustand UI state store

### File: `src/store/useTodoFiltersStore.ts`

```ts
import { create } from "zustand";

type Sort = "dueDate" | "createdAt";
type StatusFilter = "ALL" | "TODO" | "IN_PROGRESS" | "DONE";

interface TodoFiltersState {
  status: StatusFilter;
  sort: Sort;
  setStatus: (s: StatusFilter) => void;
  setSort: (s: Sort) => void;
  reset: () => void;
}

export const useTodoFiltersStore = create<TodoFiltersState>((set) => ({
  status: "ALL",
  sort: "dueDate",
  setStatus: (status) => set({ status }),
  setSort: (sort) => set({ sort }),
  reset: () => set({ status: "ALL", sort: "dueDate" }),
}));
```

### Layering convention (document in README, ticket 13)

| Concern | Tool |
|---------|------|
| Server data (todos, user) | TanStack Query |
| Session, access token | Auth.js |
| UI ephemeral (filters, modals, drawers) | Zustand |

NEVER cache server data in Zustand. NEVER persist auth state outside Auth.js.

### Done when

- Todo page filter state lives in Zustand
- Filter survives client-side navigation (`router.push`)
- Filter resets on full page refresh (no persistence middleware)

---

## Notes for executor

- `clientApi` accepts an explicit token (from `useSession()`) — this keeps the function pure and testable
- `serverApi` reads session via dynamic import to avoid bundling server-only code into client
- For long-lived caches, raise `staleTime` per-hook; default 30s is for the todo smoke test
- Add `persist` middleware to Zustand only if a specific UI state must survive refresh (the plan's "Done when" forbids it for filters)
