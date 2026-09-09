import { createWithEqualityFn } from 'zustand/traditional';
import { persist } from 'zustand/middleware';
import { Winery, Visit } from '@/lib/types';

export type ModalType = 'visit_form' | 'winery_notes' | 'share' | null;

export interface ActiveModal {
  type: ModalType;
  props?: Record<string, any>;
}

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
  activeModal: ActiveModal | null;
  modalTitle: string;
  modalDescription: string;
  isVisitHistoryModalOpen: boolean;
  returnToVisitHistory: boolean; // New flag
  isShareDialogOpen: boolean;
  shareTripId: string | null;
  shareTripName: string | null;
  isHydrated: boolean;

  // Singleton Modal State
  activeVisitWinery: Winery | null;
  editingVisit: Visit | null;
  activeNoteWineryDbId: number | null;
  activeNoteInitialValue: string;
  activeNoteTripId: string | null;

  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setVisitHistoryModalOpen: (isOpen: boolean) => void;
  openWineryModal: (wineryId: string, returnToHistory?: boolean) => void; // Updated signature
  closeWineryModal: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (message: string, type: 'success' | 'error' | 'info') => void;
  removeNotification: (id: number) => void;
  openModal: (type?: ModalType, props?: Record<string, any>, title?: string, description?: string) => void;
  closeModal: () => void;
  
  openVisitForm: (winery: Winery, editingVisit?: Visit | null) => void;
  closeVisitForm: () => void;
  openWineryNoteEditor: (wineryDbId: number, initialNotes: string, tripId?: string | number | null) => void;
  closeWineryNoteEditor: () => void;

  openShareDialog: (tripId: string, tripName: string) => void;
  closeShareDialog: () => void;
  setHydrated: (isHydrated: boolean) => void;
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
      activeModal: null,
      modalTitle: '',
      modalDescription: '',
      isVisitHistoryModalOpen: false,
      returnToVisitHistory: false,
      isShareDialogOpen: false,
      shareTripId: null,
      shareTripName: null,
      isHydrated: false,
      
      activeVisitWinery: null,
      editingVisit: null,
      activeNoteWineryDbId: null,
      activeNoteInitialValue: '',
      activeNoteTripId: null,

      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
      setVisitHistoryModalOpen: (isOpen) => set({ isVisitHistoryModalOpen: isOpen }),
      openWineryModal: (wineryId, returnToHistory = false) => set({ 
        isWineryModalOpen: true, 
        activeWineryId: wineryId,
        returnToVisitHistory: returnToHistory
      }),
      closeWineryModal: () => set((state) => {
        const base = {
          isWineryModalOpen: false, 
          activeWineryId: null,
          activeModal: null,
          activeVisitWinery: null,
          editingVisit: null,
          activeNoteWineryDbId: null,
          activeNoteInitialValue: '',
          activeNoteTripId: null,
        };
        // If the flag is set, open the history modal when closing the winery modal
        if (state.returnToVisitHistory) {
          return { 
            ...base,
            returnToVisitHistory: false, 
            isVisitHistoryModalOpen: true,
          };
        }
        return base;
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
      openModal: (type = null, props = {}, title = '', description = '') => set({ 
        isModalOpen: true, 
        activeModal: type ? { type, props } : null, 
        modalTitle: title, 
        modalDescription: description 
      }),
      closeModal: () => set({ 
        isModalOpen: false, 
        activeModal: null, 
        modalTitle: '', 
        modalDescription: '',
        activeVisitWinery: null,
        editingVisit: null,
        activeNoteWineryDbId: null,
        activeNoteInitialValue: '',
        activeNoteTripId: null,
      }),

      openVisitForm: (winery, editingVisit = null) => set({
        activeModal: { type: 'visit_form', props: { winery, editingVisit } },
        activeVisitWinery: winery,
        editingVisit: editingVisit,
        isModalOpen: true,
        modalTitle: editingVisit ? 'Edit Visit' : 'Log a Visit',
        modalDescription: `Reviewing your visit to ${winery.name}`
      }),
      closeVisitForm: () => set({
        isModalOpen: false,
        activeModal: null,
        modalTitle: '',
        modalDescription: '',
        activeVisitWinery: null,
        editingVisit: null,
        activeNoteWineryDbId: null,
        activeNoteInitialValue: '',
        activeNoteTripId: null,
      }),

      openWineryNoteEditor: (wineryDbId, initialNotes, tripId) => {
        const tripIdStr = tripId && typeof tripId !== 'function' ? String(tripId) : null;
        set({
          activeModal: {
            type: 'winery_notes',
            props: { wineryDbId, initialNotes, tripId: tripIdStr }
          },
          activeNoteWineryDbId: wineryDbId,
          activeNoteInitialValue: initialNotes,
          activeNoteTripId: tripIdStr,
          isModalOpen: true,
          modalTitle: 'Winery Notes',
          modalDescription: 'Add private notes for this winery'
        });
      },
      closeWineryNoteEditor: () => set({
        isModalOpen: false,
        activeModal: null,
        modalTitle: '',
        modalDescription: '',
        activeVisitWinery: null,
        editingVisit: null,
        activeNoteWineryDbId: null,
        activeNoteInitialValue: '',
        activeNoteTripId: null,
      }),

      openShareDialog: (tripId, tripName) => set({ 
        isShareDialogOpen: true, 
        shareTripId: tripId, 
        shareTripName: tripName,
        activeModal: { type: 'share', props: { tripId, tripName } }
      }),
      closeShareDialog: () => {
        if (typeof window !== 'undefined' && (window as any).useTripStore) {
          (window as any).useTripStore.getState().setSelectedTrip(null);
        }
        set({ 
          isShareDialogOpen: false, 
          shareTripId: null, 
          shareTripName: null,
          activeModal: null,
        });
      },
      setHydrated: (isHydrated) => set({ isHydrated }),
      reset: () => set({
        isSidebarOpen: false,
        isWineryModalOpen: false,
        activeWineryId: null,
        theme: 'light',
        notifications: [],
        isModalOpen: false,
        activeModal: null,
        modalTitle: '',
        modalDescription: '',
        isVisitHistoryModalOpen: false,
        returnToVisitHistory: false,
        isShareDialogOpen: false,
        shareTripId: null,
        shareTripName: null,
        isHydrated: false,
        activeVisitWinery: null,
        editingVisit: null,
        activeNoteWineryDbId: null,
        activeNoteInitialValue: '',
        activeNoteTripId: null,
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
