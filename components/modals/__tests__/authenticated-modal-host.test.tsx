import { render, act } from "@testing-library/react";
import { AuthenticatedModalHost } from "@/components/modals/authenticated-modal-host";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";

describe("AuthenticatedModalHost Lifecycle & Cleanup", () => {
  beforeEach(() => {
    act(() => {
      useUIStore.getState().closeModal();
      useUIStore.getState().closeWineryModal();
      useUIStore.getState().setVisitHistoryModalOpen(false);
    });
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
    window.sessionStorage.clear();
  });

  it("asserts route navigation/unmount dismisses open modals and cleanses body pointer-event and overflow locks", () => {
    // Setup active modal and body pointer locks
    act(() => {
      useUIStore.getState().openModal("visit_form", {}, "Test Modal", "Testing");
      useUIStore.getState().openWineryModal("winery-123");
      useUIStore.getState().setVisitHistoryModalOpen(true);
    });

    document.body.style.pointerEvents = "none";
    document.body.style.overflow = "hidden";

    const { unmount } = render(<AuthenticatedModalHost />);

    // Simulate route navigation by unmounting the host
    act(() => {
      unmount();
    });

    // Modal states in store must be reset
    const state = useUIStore.getState();
    expect(state.isModalOpen).toBe(false);
    expect(state.isWineryModalOpen).toBe(false);
    expect(state.isVisitHistoryModalOpen).toBe(false);

    // Body pointer locks must be cleansed
    expect(document.body.style.pointerEvents).toBe("");
    expect(document.body.style.overflow).toBe("");
  });

  describe("PWA Post-Update Modal Restoration on Mount", () => {
    it("reopens winery modal, invokes ensureWineryDetails, and cleanses _PWA_ACTIVE_WINERY_ID from sessionStorage on mount", async () => {
      const targetWineryId = "winery-pwa-restoration-789";
      window.sessionStorage.setItem("_PWA_ACTIVE_WINERY_ID", targetWineryId);

      const ensureWineryDetailsSpy = jest
        .spyOn(useWineryStore.getState(), "ensureWineryDetails")
        .mockResolvedValue(null as any);
      const openWineryModalSpy = jest.spyOn(useUIStore.getState(), "openWineryModal");

      await act(async () => {
        render(<AuthenticatedModalHost />);
      });

      // Assert modal reopening and detail hydration
      expect(openWineryModalSpy).toHaveBeenCalledWith(targetWineryId);
      expect(ensureWineryDetailsSpy).toHaveBeenCalledWith(targetWineryId);

      // Assert active winery ID state in UI store
      expect(useUIStore.getState().isWineryModalOpen).toBe(true);
      expect(useUIStore.getState().activeWineryId).toBe(targetWineryId);

      // Assert session storage item was cleansed to prevent infinite reopen loops
      expect(window.sessionStorage.getItem("_PWA_ACTIVE_WINERY_ID")).toBeNull();

      ensureWineryDetailsSpy.mockRestore();
      openWineryModalSpy.mockRestore();
    });

    it("does not trigger modal opening or ensureWineryDetails if _PWA_ACTIVE_WINERY_ID is absent from sessionStorage", async () => {
      const ensureWineryDetailsSpy = jest
        .spyOn(useWineryStore.getState(), "ensureWineryDetails")
        .mockResolvedValue(null as any);
      const openWineryModalSpy = jest.spyOn(useUIStore.getState(), "openWineryModal");

      await act(async () => {
        render(<AuthenticatedModalHost />);
      });

      expect(openWineryModalSpy).not.toHaveBeenCalled();
      expect(ensureWineryDetailsSpy).not.toHaveBeenCalled();
      expect(useUIStore.getState().isWineryModalOpen).toBe(false);

      ensureWineryDetailsSpy.mockRestore();
      openWineryModalSpy.mockRestore();
    });
  });
});
