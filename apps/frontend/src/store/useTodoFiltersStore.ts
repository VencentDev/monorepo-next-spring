import { create } from 'zustand';

import type { paths } from '@app/api-types';

type TodoStatus = NonNullable<paths['/api/v1/todos']['get']['parameters']['query']>['status'];

export type TodoFiltersState = {
  status?: TodoStatus;
  page: number;
  setStatus: (status?: TodoStatus) => void;
  setPage: (page: number) => void;
  reset: () => void;
};

const initialState = {
  status: undefined,
  page: 0,
};

export const useTodoFiltersStore = create<TodoFiltersState>((set) => ({
  ...initialState,
  setStatus: (status) => set({ status, page: 0 }),
  setPage: (page) => set({ page }),
  reset: () => set(initialState),
}));
