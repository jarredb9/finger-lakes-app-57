import fs from "fs";
import path from "path";
import React from "react";
import { render, act } from "@testing-library/react";
import { useUIStore } from "@/lib/stores/uiStore";

const ROOT_DIR = process.cwd();

describe("Root Layout Decoupling & Authenticated Modal Host (Phase 3 Task 1)", () => {
  describe("Requirement 1: Root Layout Modal Isolation", () => {
    it("asserts app/layout.tsx retains <ModalHost /> (#modal-root) but contains no direct imports or JSX nodes for modal dialogs", () => {
      const layoutPath = path.join(ROOT_DIR, "app/layout.tsx");
      expect(fs.existsSync(layoutPath)).toBe(true);

      const layoutSource = fs.readFileSync(layoutPath, "utf8");

      // Must retain ModalHost for portal anchor (#modal-root)
      expect(layoutSource).toMatch(/<ModalHost\s*\/>/);
      expect(layoutSource).toMatch(/from ['"]@\/components\/modal-host['"]/);

      // Must NOT directly import or render heavy modal trees in root layout
      expect(layoutSource).not.toMatch(/from ['"]@\/components\/VisitFormModal['"]/);
      expect(layoutSource).not.toMatch(/<VisitFormModal/);

      expect(layoutSource).not.toMatch(/from ['"]@\/components\/WineryNoteModal['"]/);
      expect(layoutSource).not.toMatch(/<WineryNoteModal/);

      expect(layoutSource).not.toMatch(/from ['"]@\/components\/trip-share-dialog-wrapper['"]/);
      expect(layoutSource).not.toMatch(/<TripShareDialogWrapper/);

      expect(layoutSource).not.toMatch(/from ['"]@\/components\/global-modal-renderer['"]/);
      expect(layoutSource).not.toMatch(/<GlobalModalRenderer/);
    });
  });

  describe("Requirement 2: AuthenticatedModalHost Dynamic Loading & Idle Prefetching", () => {
    it("asserts AuthenticatedModalHost dynamically loads modal trees with ssr: false and initiates idle prefetch", () => {
      const hostFilePath = path.join(ROOT_DIR, "components/modals/authenticated-modal-host.tsx");
      expect(fs.existsSync(hostFilePath)).toBe(true);

      const hostSource = fs.readFileSync(hostFilePath, "utf8");
      expect(hostSource).toMatch(/['"]use client['"]/);

      // Verify dynamic imports with ssr: false for all 6 modal dialog trees
      const requiredModals = [
        "VisitFormModal",
        "WineryNoteModal",
        "TripShareDialogWrapper",
        "GlobalModalRenderer",
        "WineryModal",
        "VisitHistoryModal",
      ];

      for (const modal of requiredModals) {
        expect(hostSource).toContain(modal);
      }
      expect(hostSource).toMatch(/dynamic\s*\(/);
      expect(hostSource).toMatch(/ssr:\s*false/);

      // Verify idle prefetch scheduling via requestIdleCallback
      expect(hostSource).toMatch(/requestIdleCallback/);
    });
  });

  describe("Requirement 3: Caller Mounting & AppShell Cleanliness", () => {
    it("asserts components/app-shell.tsx, app/trips/[id]/page.tsx, app/friends/[id]/page.tsx, and app/settings/page.tsx mount AuthenticatedModalHost", () => {
      const appShellPath = path.join(ROOT_DIR, "components/app-shell.tsx");
      const tripDetailPath = path.join(ROOT_DIR, "app/trips/[id]/page.tsx");
      const friendsDetailPath = path.join(ROOT_DIR, "app/friends/[id]/page.tsx");
      const settingsPath = path.join(ROOT_DIR, "app/settings/page.tsx");

      expect(fs.existsSync(appShellPath)).toBe(true);
      expect(fs.existsSync(tripDetailPath)).toBe(true);
      expect(fs.existsSync(friendsDetailPath)).toBe(true);
      expect(fs.existsSync(settingsPath)).toBe(true);

      const appShellSource = fs.readFileSync(appShellPath, "utf8");
      const tripDetailSource = fs.readFileSync(tripDetailPath, "utf8");
      const friendsDetailSource = fs.readFileSync(friendsDetailPath, "utf8");
      const settingsSource = fs.readFileSync(settingsPath, "utf8");

      // AppShell must import and mount AuthenticatedModalHost
      expect(appShellSource).toMatch(/AuthenticatedModalHost/);
      expect(appShellSource).toMatch(/<AuthenticatedModalHost\s*\/>/);

      // AppShell must remove redundant direct modal instances and imports
      expect(appShellSource).not.toMatch(/<WineryModal\s*\/>/);
      expect(appShellSource).not.toMatch(/<VisitHistoryModal\s*\/>/);
      expect(appShellSource).not.toMatch(/from ['"]@\/components\/winery-modal['"]/);
      expect(appShellSource).not.toMatch(/from ['"]@\/components\/visit-history-modal['"]/);

      // Trip Detail standalone route must import and mount AuthenticatedModalHost
      expect(tripDetailSource).toMatch(/AuthenticatedModalHost/);
      expect(tripDetailSource).toMatch(/<AuthenticatedModalHost\s*\/>/);

      // Friends Detail route must import and mount AuthenticatedModalHost
      expect(friendsDetailSource).toMatch(/AuthenticatedModalHost/);
      expect(friendsDetailSource).toMatch(/<AuthenticatedModalHost\s*\/>/);

      // Settings route must import and mount AuthenticatedModalHost
      expect(settingsSource).toMatch(/AuthenticatedModalHost/);
      expect(settingsSource).toMatch(/<AuthenticatedModalHost\s*\/>/);
    });
  });

  describe("Requirement 4: Route Transitions & Pointer Lock Cleansing", () => {
    it("asserts route navigation/unmount dismisses open modals and cleanses body pointer-event and overflow locks", () => {
      // Setup active modal and body pointer locks
      act(() => {
        useUIStore.getState().openModal("visit_form", {}, "Test Modal", "Testing");
        useUIStore.getState().openWineryModal("winery-123");
        useUIStore.getState().setVisitHistoryModalOpen(true);
      });

      document.body.style.pointerEvents = "none";
      document.body.style.overflow = "hidden";

      // Attempt to dynamically require AuthenticatedModalHost
      let AuthenticatedModalHost: React.ComponentType | null = null;
      try {
        const mod = require("@/components/modals/authenticated-modal-host");
        AuthenticatedModalHost = mod.AuthenticatedModalHost || mod.default;
      } catch {
        // Module does not exist yet in Red phase
      }

      expect(AuthenticatedModalHost).not.toBeNull();

      if (AuthenticatedModalHost) {
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
      }
    });
  });
});
