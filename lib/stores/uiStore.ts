import { createWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { ReactNode } from 'react';
import { Winery } from '@/lib/types';

interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UIState {
  isSidebarOpen: boolean;
  isWineryModalOpen: boolean;
  activeWineryId: string | null;
  theme: 'light' | 'dark';
  notifications: Notification[];
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  openWineryModal: (wineryId: string) => void;
  closeWineryModal: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  removeNotification: (id: number) => void;
}

export const useUIStore = createWithEqualityFn<UIState>((set) => ({
  isSidebarOpen: false,
  isWineryModalOpen: false,
  activeWineryId: null,
  theme: 'light',
  notifications: [],
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  openWineryModal: (wineryId) => set({ isWineryModalOpen: true, activeWineryId: wineryId }),
  closeWineryModal: () => set({ isWineryModalOpen: false, activeWineryId: null }),
  setTheme: (theme) => set({ theme }),
  addNotification: (message, type) =>
    set((state) => ({
      notifications: [...state.notifications, { id: Date.now(), message, type }],
    })),
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));