import { StateCreator } from 'zustand';
import type { VisitState } from '../visitStore';

export interface VisitUISlice {
  page: number;
  totalPages: number;
  hasMore: boolean;
}

export const createVisitUISlice: StateCreator<
  VisitState,
  [],
  [],
  VisitUISlice
> = () => ({
  page: 1,
  totalPages: 1,
  hasMore: false,
});
