import { create } from 'zustand';
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
  wineryModalContent: Winery | null;
  theme: 'light' | 'dark';
  notifications: Notification[];
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  openWineryModal: (winery: Winery) => void;
  closeWineryModal: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  removeNotification: (id: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  isWineryModalOpen: false,
  wineryModalContent: null,
  theme: 'light',
  notifications: [],
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  openWineryModal: (winery) => set({ isWineryModalOpen: true, wineryModalContent: winery }),
  closeWineryModal: () => set({ isWineryModalOpen: false, wineryModalContent: null }),
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