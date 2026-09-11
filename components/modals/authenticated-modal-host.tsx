"use client";

import { useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useUIStore } from "@/lib/stores/uiStore";

// Dynamically load modal trees with ssr: false
const VisitFormModal = dynamic(
  () => import("@/components/VisitFormModal").then((mod) => mod.VisitFormModal),
  { ssr: false }
);

const WineryNoteModal = dynamic(
  () => import("@/components/WineryNoteModal").then((mod) => mod.WineryNoteModal),
  { ssr: false }
);

const TripShareDialogWrapper = dynamic(
  () => import("@/components/trip-share-dialog-wrapper").then((mod) => mod.TripShareDialogWrapper),
  { ssr: false }
);

const GlobalModalRenderer = dynamic(
  () => import("@/components/global-modal-renderer").then((mod) => mod.GlobalModalRenderer),
  { ssr: false }
);

const WineryModal = dynamic(
  () => import("@/components/winery-modal").then((mod) => mod.WineryModal),
  { ssr: false }
);

const VisitHistoryModal = dynamic(
  () => import("@/components/visit-history-modal").then((mod) => mod.VisitHistoryModal),
  { ssr: false }
);

export function AuthenticatedModalHost() {
  const pathname = usePathname();

  const closeModal = useUIStore((state) => state.closeModal);
  const closeWineryModal = useUIStore((state) => state.closeWineryModal);
  const closeVisitForm = useUIStore((state) => state.closeVisitForm);
  const closeWineryNoteEditor = useUIStore((state) => state.closeWineryNoteEditor);
  const closeShareDialog = useUIStore((state) => state.closeShareDialog);
  const setVisitHistoryModalOpen = useUIStore((state) => state.setVisitHistoryModalOpen);

  const cleanupModalsAndBody = useCallback(() => {
    closeModal();
    closeWineryModal();
    closeVisitForm();
    closeWineryNoteEditor();
    closeShareDialog();
    setVisitHistoryModalOpen(false);

    if (typeof document !== "undefined") {
      document.body.style.pointerEvents = "";
      document.body.style.overflow = "";
    }
  }, [
    closeModal,
    closeWineryModal,
    closeVisitForm,
    closeWineryNoteEditor,
    closeShareDialog,
    setVisitHistoryModalOpen,
  ]);

  // Idle prefetch modal chunks
  useEffect(() => {
    const prefetchModals = () => {
      import("@/components/VisitFormModal");
      import("@/components/WineryNoteModal");
      import("@/components/trip-share-dialog-wrapper");
      import("@/components/global-modal-renderer");
      import("@/components/winery-modal");
      import("@/components/visit-history-modal");
    };

    if (typeof window !== "undefined") {
      if ("requestIdleCallback" in window) {
        const handle = (window as any).requestIdleCallback(prefetchModals);
        return () => {
          if ("cancelIdleCallback" in window) {
            (window as any).cancelIdleCallback(handle);
          }
        };
      } else {
        const timer = setTimeout(prefetchModals, 200);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, []);

  // Clean up open modal state and body locks on route transitions
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    cleanupModalsAndBody();
  }, [pathname, cleanupModalsAndBody]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupModalsAndBody();
    };
  }, [cleanupModalsAndBody]);

  return (
    <>
      <VisitFormModal />
      <WineryNoteModal />
      <TripShareDialogWrapper />
      <GlobalModalRenderer />
      <WineryModal />
      <VisitHistoryModal />
    </>
  );
}

export default AuthenticatedModalHost;
