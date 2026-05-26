'use client';

import { ErrorState } from '@/app/app/todos/_components/error-state';
import { TodoCreateButton } from '@/app/app/todos/_components/todo-create-button';
import { TodoFilters } from '@/app/app/todos/_components/todo-filters';
import { TodoList } from '@/app/app/todos/_components/todo-list';
import { Skeleton } from '@/components/ui/skeleton';
import { useTodos } from '@/hooks/useTodos';
import { useTodoFiltersStore } from '@/store/useTodoFiltersStore';

export default function TodosPage() {
  const { status, page } = useTodoFiltersStore();
  const { data, isLoading, error } = useTodos({
    status: status === 'ALL' ? undefined : status,
    page,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Todos</h1>
          <p className="text-sm text-muted-foreground">Manage your current work queue.</p>
        </div>
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
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-24 rounded-md" />
      ))}
    </div>
  );
}
