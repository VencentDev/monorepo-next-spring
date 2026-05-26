'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';

import { TodoFormSheet } from '@/app/app/todos/_components/todo-form-sheet';
import { Button } from '@/components/ui/button';

export function TodoCreateButton({ label = 'New todo' }: { label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {label}
      </Button>
      <TodoFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
