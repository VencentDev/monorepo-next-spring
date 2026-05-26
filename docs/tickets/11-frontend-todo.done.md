# 11 — Frontend Todo UI (Smoke Test)

**Phase:** 9
**Depends on:** 06 (backend todo API), 09 (auth), 10 (API client + state)
**Unblocks:** acceptance gate "todo smoke test"

## Scope

`/app/todos` list page with filtering (Zustand), CRUD via modal/sheet with optimistic updates, error handling (401 → re-auth, 403/404 → inline).

---

## T9.1 — `/app/todos` page

### File: `src/app/app/todos/page.tsx`

```tsx
'use client';
import { useTodos } from '@/hooks/useTodos';
import { useTodoFiltersStore } from '@/store/useTodoFiltersStore';
import { TodoList } from './_components/todo-list';
import { TodoFilters } from './_components/todo-filters';
import { TodoCreateButton } from './_components/todo-create-button';
import { Skeleton } from '@/components/ui/skeleton';

export default function TodosPage() {
  const { status } = useTodoFiltersStore();
  const { data, isLoading, error } = useTodos({
    status: status === 'ALL' ? undefined : status,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Todos</h1>
        <TodoCreateButton />
      </div>
      <TodoFilters />
      {isLoading && <TodoListSkeleton />}
      {error && <ErrorState error={error} />}
      {data && <TodoList todos={data.content} />}
    </div>
  );
}

function TodoListSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}
```

### Files (sub-components)

- `src/app/app/todos/_components/todo-list.tsx`
- `src/app/app/todos/_components/todo-filters.tsx` — uses `useTodoFiltersStore`
- `src/app/app/todos/_components/todo-create-button.tsx` — opens create sheet
- `src/app/app/todos/_components/todo-form-sheet.tsx` — shared create/edit form
- `src/app/app/todos/_components/todo-card.tsx` — single todo, edit/delete actions

### todo-filters.tsx

```tsx
'use client';
import { useTodoFiltersStore } from '@/store/useTodoFiltersStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function TodoFilters() {
  const { status, setStatus } = useTodoFiltersStore();
  return (
    <Select value={status} onValueChange={(v) => setStatus(v as any)}>
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All</SelectItem>
        <SelectItem value="TODO">To do</SelectItem>
        <SelectItem value="IN_PROGRESS">In progress</SelectItem>
        <SelectItem value="DONE">Done</SelectItem>
      </SelectContent>
    </Select>
  );
}
```

### Sort

Sorted by due date — backend already orders via `@PageableDefault(sort="dueDate")` (ticket 06).

### Empty state

When `data.content.length === 0`: show centered illustration/message + "Create your first todo" CTA.

### Done when

- Page renders with filters wired to Zustand
- Skeletons during load
- Empty state shows when no todos
- Filter change re-fetches with new query key

---

## T9.2 — Create / edit / delete with optimistic updates

### todo-form-sheet.tsx

```tsx
'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateTodo, useUpdateTodo } from '@/hooks/useTodos';
import { useToast } from '@/components/ui/use-toast';
import { useState } from 'react';

export function TodoFormSheet({
  open,
  onOpenChange,
  todo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  todo?: Todo;
}) {
  const [title, setTitle] = useState(todo?.title ?? '');
  const [description, setDescription] = useState(todo?.description ?? '');
  const [status, setStatus] = useState(todo?.status ?? 'TODO');
  const [dueDate, setDueDate] = useState(todo?.dueDate ?? '');
  const create = useCreateTodo();
  const update = useUpdateTodo();
  const { toast } = useToast();

  async function onSubmit() {
    try {
      if (todo) {
        await update.mutateAsync({
          id: todo.id,
          body: {
            title: title === todo.title ? undefined : title,
            description: description === todo.description ? undefined : description,
            status: status === todo.status ? undefined : status,
            dueDate: dueDate === (todo.dueDate ?? '') ? undefined : dueDate || null,
          },
        });
      } else {
        await create.mutateAsync({ title, description, status, dueDate: dueDate || undefined });
      }
      toast({ title: todo ? 'Updated' : 'Created' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Failed', description: String(e?.message ?? e), variant: 'destructive' });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{todo ? 'Edit todo' : 'New todo'}</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          <Select value={status} onValueChange={setStatus as any}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODO">To do</SelectItem>
              <SelectItem value="IN_PROGRESS">In progress</SelectItem>
              <SelectItem value="DONE">Done</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Button onClick={onSubmit} className="w-full">
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

### PATCH semantics — CRITICAL

The form sends:

- key **absent** → field untouched (`undefined` in JSON → omitted by `JSON.stringify`)
- key with `null` → field cleared on backend (e.g., user clears `dueDate`)
- key with value → field updated

Backend uses `JsonNullable<T>` to distinguish these. This is the entire reason for the `JsonNullable` plumbing in tickets 03/05/06.

### Optimistic updates (in `useUpdateTodo` from ticket 10)

Already scaffolded in ticket 10 with `onMutate` / `onError` rollback. Flesh out cache patching:

```ts
onMutate: async ({ id, body }) => {
  await qc.cancelQueries({ queryKey: qk.todos.all() });
  const previous = qc.getQueriesData({ queryKey: qk.todos.all() });
  qc.setQueriesData<ListResp>({ queryKey: qk.todos.all() }, (old) => {
    if (!old) return old;
    return {
      ...old,
      content: old.content.map((t) =>
        t.id === id
          ? {
              ...t,
              ...(body.title !== undefined && { title: body.title ?? t.title }),
              ...(body.status !== undefined && { status: body.status ?? t.status }),
              ...(body.dueDate !== undefined && { dueDate: body.dueDate }),
              ...(body.description !== undefined && { description: body.description }),
            }
          : t
      ),
    };
  });
  return { previous };
},
```

### Delete

```tsx
const del = useDeleteTodo();
async function onDelete(id: string) {
  if (!confirm('Delete this todo?')) return;
  try {
    await del.mutateAsync(id);
    toast({ title: 'Deleted' });
  } catch (e: any) {
    toast({ title: 'Failed', description: String(e?.message ?? e), variant: 'destructive' });
  }
}
```

### Done when

- Create → todo appears in list immediately, persists after refresh
- Edit → optimistic update visible; if backend returns 500, list reverts
- Delete → todo disappears; toast confirms
- Forced 500 (toggle dev backend off mid-mutation) → rollback works

---

## T9.3 — Error + unauth handling

### Pattern

In `apiFetch` (ticket 10), `ApiError.status` carries the response code.

### File: `src/app/app/todos/_components/error-state.tsx`

```tsx
'use client';
import { ApiError } from '@/lib/api';
import { signIn } from 'next-auth/react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function ErrorState({ error }: { error: unknown }) {
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) signIn('keycloak');
  }, [error]);

  if (error instanceof ApiError) {
    if (error.status === 401) return <p>Redirecting to sign in…</p>;
    if (error.status === 403)
      return <InlineError title="Forbidden" message="You don't have access." />;
    if (error.status === 404)
      return <InlineError title="Not found" message="That todo doesn't exist." />;
  }
  return <InlineError title="Something went wrong" message="Please try again." />;
}

function InlineError({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
```

### Session error handling

If `session.error === "RefreshAccessTokenError"` (set by ticket 09 jwt callback), force re-auth:

```tsx
'use client';
import { useSession } from 'next-auth/react';
import { signIn } from 'next-auth/react';
import { useEffect } from 'react';

export function SessionErrorGate({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.error === 'RefreshAccessTokenError') signIn('keycloak');
  }, [session?.error]);
  return <>{children}</>;
}
```

Wrap `app/app/layout.tsx` body with `<SessionErrorGate>`.

### Done when

- 401 from API → user redirected to Keycloak sign-in
- 403 / 404 → inline error card, no redirect
- Session refresh failure → automatic re-auth flow

---

## Notes for executor

- Sheets vs dialogs: plan says either; sheet works better for forms with multiple fields
- Toast component from shadcn — install via `pnpm dlx shadcn@latest add toast`
- DO NOT pull todo data into Zustand; server state stays in TanStack Query
- DO NOT add a separate `useTodo(id)` detail query unless the page needs server-rendered details — the smoke test reads from the list cache
- Confirm the smoke test acceptance gate from README: two Keycloak users see disjoint lists (manual test with two browser profiles)
