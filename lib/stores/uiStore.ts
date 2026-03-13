import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import { ReactNode } from 'react';
import { Winery, Visit } from '@/lib/types';

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
  isModalOpen: boolean;
  modalContent: ReactNode | null;
  modalTitle: string;
  modalDescription: string;
  isVisitHistoryModalOpen: boolean;
  returnToVisitHistory: boolean; // New flag
  isShareDialogOpen: boolean;
  shareTripId: string | null;
  shareTripName: string | null;

  // Singleton Modal State
  activeVisitWinery: Winery | null;
  editingVisit: Visit | null;
  activeNoteWineryDbId: number | null;
  activeNoteInitialValue: string;
  onNoteSave: ((wineryDbId: number, notes: string) => void) | null;

  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setVisitHistoryModalOpen: (isOpen: boolean) => void;
  openWineryModal: (wineryId: string, returnToHistory?: boolean) => void; // Updated signature
  closeWineryModal: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  removeNotification: (id: number) => void;
  openModal: (content: ReactNode, title?: string, description?: string) => void;
  closeModal: () => void;
  
  openVisitForm: (winery: Winery, editingVisit?: Visit | null) => void;
  closeVisitForm: () => void;
  openWineryNoteEditor: (wineryDbId: number, initialNotes: string, onSave: (wineryDbId: number, notes: string) => void) => void;
  closeWineryNoteEditor: () => void;

  openShareDialog: (tripId: string, tripName: string) => void;
  closeShareDialog: () => void;
  reset: () => void;
}

export const useUIStore = createWithEqualityFn<UIState>()(
  persist(
    (set) => ({
      isSidebarOpen: false,
      isWineryModalOpen: false,
      activeWineryId: null,
      theme: 'light',
      notifications: [],
      isModalOpen: false,
      modalContent: null,
      modalTitle: '',
      modalDescription: '',
      isVisitHistoryModalOpen: false,
      returnToVisitHistory: false,
      isShareDialogOpen: false,
      shareTripId: null,
      shareTripName: null,
      
      activeVisitWinery: null,
      editingVisit: null,
      activeNoteWineryDbId: null,
      activeNoteInitialValue: '',
      onNoteSave: null,

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
      setVisitHistoryModalOpen: (isOpen) => set({ isVisitHistoryModalOpen: isOpen }),
      openWineryModal: (wineryId, returnToHistory = false) => set({ 
        isWineryModalOpen: true, 
        activeWineryId: wineryId,
        returnToVisitHistory: returnToHistory
      }),
      closeWineryModal: () => set((state) => {
        // If the flag is set, open the history modal when closing the winery modal
        if (state.returnToVisitHistory) {
          return { isWineryModalOpen: false, activeWineryId: null, returnToVisitHistory: false, isVisitHistoryModalOpen: true };
        }
        return { isWineryModalOpen: false, activeWineryId: null };
      }),
      setTheme: (theme) => set({ theme }),
      addNotification: (message, type) =>
        set((state) => ({
          notifications: [...state.notifications, { id: Date.now(), message, type }],
        })),
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      openModal: (content, title = '', description = '') => set({ isModalOpen: true, modalContent: content, modalTitle: title, modalDescription: description }),
      closeModal: () => set({ isModalOpen: false, modalContent: null, modalTitle: '', modalDescription: '' }),

      openVisitForm: (winery, editingVisit = null) => set({
        activeVisitWinery: winery,
        editingVisit: editingVisit,
        isModalOpen: true,
        modalTitle: editingVisit ? 'Edit Visit' : 'Log a Visit',
        modalDescription: `Reviewing your visit to ${winery.name}`
      }),
      closeVisitForm: () => set({
        activeVisitWinery: null,
        editingVisit: null,
        isModalOpen: false,
        modalTitle: '',
        modalDescription: ''
      }),

      openWineryNoteEditor: (wineryDbId, initialNotes, onSave) => set({
        activeNoteWineryDbId: wineryDbId,
        activeNoteInitialValue: initialNotes,
        onNoteSave: onSave,
        isModalOpen: true,
        modalTitle: 'Winery Notes',
        modalDescription: 'Add private notes for this winery'
      }),
      closeWineryNoteEditor: () => set({
        activeNoteWineryDbId: null,
        activeNoteInitialValue: '',
        onNoteSave: null,
        isModalOpen: false,
        modalTitle: '',
        modalDescription: ''
      }),

      openShareDialog: (tripId, tripName) => set({ 
        isShareDialogOpen: true, 
        shareTripId: tripId, 
        shareTripName: tripName 
      }),
      closeShareDialog: () => set({ 
        isShareDialogOpen: false, 
        shareTripId: null, 
        shareTripName: null 
      }),
      reset: () => set({
        isSidebarOpen: false,
        isWineryModalOpen: false,
        activeWineryId: null,
        theme: 'light',
        notifications: [],
        isModalOpen: false,
        modalContent: null,
        modalTitle: '',
        modalDescription: '',
        isVisitHistoryModalOpen: false,
        returnToVisitHistory: false,
        isShareDialogOpen: false,
        shareTripId: null,
        shareTripName: null,
      }),
    }),
    {
      name: process.env.NEXT_PUBLIC_IS_E2E === 'true' ? 'ui-storage-e2e' : 'ui-storage',
      partialize: (state) => ({
        isSidebarOpen: state.isSidebarOpen,
        theme: state.theme,
      }),
    }
  )
);

// Expose store for E2E testing
if (typeof window !== 'undefined') {
  (window as any).useUIStore = useUIStore;
}
