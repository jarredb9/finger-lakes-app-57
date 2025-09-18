
import { create } from 'zustand';
import { ReactNode } from 'react';

interface Notification {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UIState {
  isSidebarOpen: boolean;
  isModalOpen: boolean;
  modalContent: ReactNode | null;
  modalTitle: string | null;
  modalDescription: ReactNode | null;
  theme: 'light' | 'dark';
  notifications: Notification[];
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  openModal: (content: ReactNode, title?: string, description?: ReactNode) => void;
  closeModal: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  removeNotification: (id: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  isModalOpen: false,
  modalContent: null,
  modalTitle: null,
  modalDescription: null,
  theme: 'light',
  notifications: [],
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  openModal: (content, title, description) => set({ isModalOpen: true, modalContent: content, modalTitle: title, modalDescription: description }),
  closeModal: () => set({ isModalOpen: false, modalContent: null, modalTitle: null, modalDescription: null }),
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
