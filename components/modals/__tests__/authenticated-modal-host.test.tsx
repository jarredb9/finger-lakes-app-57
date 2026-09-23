import { render, act } from "@testing-library/react";
import { AuthenticatedModalHost } from "@/components/modals/authenticated-modal-host";
import { useUIStore } from "@/lib/stores/uiStore";

describe("AuthenticatedModalHost Lifecycle & Cleanup", () => {
  beforeEach(() => {
    act(() => {
      useUIStore.getState().closeModal();
      useUIStore.getState().closeWineryModal();
      useUIStore.getState().setVisitHistoryModalOpen(false);
    });
    document.body.style.pointerEvents = "";
    document.body.style.overflow = "";
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
});
