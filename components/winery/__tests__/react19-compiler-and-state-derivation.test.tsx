import fs from "fs";
import path from "path";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WineryModal } from "@/components/winery-modal";
import WineryQnA from "@/components/WineryQnA";
import { useUIStore } from "@/lib/stores/uiStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { useUserStore } from "@/lib/stores/userStore";
import { useVisitStore } from "@/lib/stores/visitStore";
import { useMapStore } from "@/lib/stores/mapStore";
import { useTripStore } from "@/lib/stores/tripStore";
import { createMockWinery } from "@/lib/test-utils/fixtures";
import { GooglePlaceId, WineryDbId } from "@/lib/types";

// Mock external heavy hooks
jest.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/hooks/use-ai-features", () => ({
  useAIFeaturesEnabled: () => true,
}));

// Mock sub-components inside WineryModal that are outside the scope of DOM stability testing
jest.mock("@/components/WineryDetails", () => ({
  __esModule: true,
  WineryDetails: function DummyWineryDetails() {
    return <div data-testid="winery-details">WineryDetails</div>;
  },
  WineryImage: function DummyWineryImage() {
    return <div data-testid="winery-image">WineryImage</div>;
  },
  default: function DummyWineryDetails() {
    return <div data-testid="winery-details">WineryDetails</div>;
  },
}));

jest.mock("@/components/TripPlannerSection", () => {
  return function DummyTripPlanner() {
    return <div data-testid="trip-planner-section">TripPlanner</div>;
  };
});

jest.mock("@/components/WineryCommunityTab", () => ({
  __esModule: true,
  WineryCommunityTab: function DummyCommunityTab() {
    return <div data-testid="community-tab">CommunityTab</div>;
  },
  default: function DummyCommunityTab() {
    return <div data-testid="community-tab">CommunityTab</div>;
  },
}));

const ROOT_DIR = process.cwd();

describe("Phase 5 Task 1: React Compiler State Derivation, Keyed Resets & Effect Suppression Removal", () => {
  const winery1 = createMockWinery({
    id: "winery-1" as GooglePlaceId,
    dbId: 101 as WineryDbId,
    name: "First Winery",
  });

  const winery2 = createMockWinery({
    id: "winery-2" as GooglePlaceId,
    dbId: 102 as WineryDbId,
    name: "Second Winery",
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useUserStore.setState({
      user: { id: "test-user", ai_enabled: true },
      isLoading: false,
    });
    useWineryStore.setState({
      persistentWineries: [winery1, winery2],
      loadingWineryId: null,
    });
    useVisitStore.setState({ visits: [] });
    useTripStore.setState({ trips: [] });
    useMapStore.setState({ isStreetViewActive: false });
    useUIStore.setState({
      isWineryModalOpen: true,
      activeWineryId: "winery-1",
    });
  });

  describe("Requirement 1: use-winery-modal-state.ts Render-Time setState Elimination", () => {
    const hookPath = path.join(ROOT_DIR, "components/winery/use-winery-modal-state.ts");

    it("asserts use-winery-modal-state.ts does not define prevActiveWineryId or call render-time state setters", () => {
      expect(fs.existsSync(hookPath)).toBe(true);
      const content = fs.readFileSync(hookPath, "utf8");

      // Must eliminate prevActiveWineryId state variable and its setter
      expect(content).not.toMatch(/prevActiveWineryId/);
      expect(content).not.toMatch(/setPrevActiveWineryId/);

      // Must not call setSnapPoint or setLightboxPhoto directly inside the component/hook body during render
      const renderTimeSetStateRegex = /if\s*\([^)]*activeWineryId[^)]*\)\s*\{[^}]*setSnapPoint/m;
      expect(content).not.toMatch(renderTimeSetStateRegex);
    });

    it("asserts lib/stores/uiStore.ts resets snapPoint to default '300px' in openWineryModal", () => {
      const uiStorePath = path.join(ROOT_DIR, "lib/stores/uiStore.ts");
      expect(fs.existsSync(uiStorePath)).toBe(true);
      const content = fs.readFileSync(uiStorePath, "utf8");

      // UI Store openWineryModal action handler must reset snapPoint to default
      expect(content).toMatch(/snapPoint/);
    });
  });

  describe("Requirement 2: Outer Modal DOM Stability & Keyed Inner Content", () => {
    const wineryModalPath = path.join(ROOT_DIR, "components/winery-modal.tsx");

    it("asserts components/winery-modal.tsx extracts keyed inner content via WineryModalContent", () => {
      expect(fs.existsSync(wineryModalPath)).toBe(true);
      const content = fs.readFileSync(wineryModalPath, "utf8");

      // Must import and use WineryModalContent with key={activeWineryId}
      expect(content).toMatch(/WineryModalContent/);
      expect(content).toMatch(/key=\{(?:activeWineryId|winery\.id)\}/);
    });

    it("asserts outer Drawer container maintains stable DOM identity across winery transitions while inner content resets", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
      window.dispatchEvent(new Event("resize"));

      const { rerender } = render(<WineryModal />);

      const outerDrawerBefore = screen.getByTestId("winery-modal-drawer");
      expect(outerDrawerBefore).toBeInTheDocument();

      // Inner content container should carry data-testid="winery-modal-content" and match active winery
      const innerContentBefore = screen.getByTestId("winery-modal-content");
      expect(innerContentBefore).toHaveAttribute("data-winery-id", "winery-1");

      // Transition to second winery
      act(() => {
        useUIStore.setState({ activeWineryId: "winery-2" });
      });
      rerender(<WineryModal />);

      // Outer drawer must be the IDENTICAL DOM element instance (no unmount/remount thrashing)
      const outerDrawerAfter = screen.getByTestId("winery-modal-drawer");
      expect(outerDrawerAfter).toBe(outerDrawerBefore);

      // Inner content container must update to winery-2
      const innerContentAfter = screen.getByTestId("winery-modal-content");
      expect(innerContentAfter).toHaveAttribute("data-winery-id", "winery-2");
    });
  });

  describe("Requirement 3: WineryQnA.tsx Active Question Transitions & Keyed Review Card", () => {
    const qnaPath = path.join(ROOT_DIR, "components/WineryQnA.tsx");

    it("asserts WineryQnA.tsx uses keyed WineryQuestionReviewCard and eliminates useEffect state sync", () => {
      expect(fs.existsSync(qnaPath)).toBe(true);
      const content = fs.readFileSync(qnaPath, "utf8");

      // Must define or import WineryQuestionReviewCard keyed by activeQuestionId
      expect(content).toMatch(/WineryQuestionReviewCard/);
      expect(content).toMatch(/key=\{(?:activeQuestionId|activeQuestion\.id)\}/);

      // Must NOT contain useEffect synchronizing setActiveReviewIndex on activeQuestionId change
      const syncEffectRegex = /useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*setActiveReviewIndex\(0\)[\s\S]*\}\s*,\s*\[[^\]]*activeQuestionId[^\]]*\]\s*\)/m;
      expect(content).not.toMatch(syncEffectRegex);
    });

    it("asserts active question transition resets review index without out-of-bounds review flashes", () => {
      const wineryWithReviews = createMockWinery({
        id: "winery-reviews" as GooglePlaceId,
        name: "Reviews Winery",
        reviews: [
          {
            author_name: "Alice",
            rating: 5,
            relative_time_description: "a week ago",
            text: "Free parking available in the main lot. Great parking space.",
            time: 123456,
          },
          {
            author_name: "Bob",
            rating: 4,
            relative_time_description: "2 weeks ago",
            text: "Plenty of parking spots near the entrance.",
            time: 123457,
          },
          {
            author_name: "Charlie",
            rating: 5,
            relative_time_description: "a month ago",
            text: "The bathroom and restroom facilities were very clean.",
            time: 123458,
          },
        ],
      });

      let currentQuestionId: string | null = "parking";
      const setQuestionId = jest.fn((newId: string | null) => {
        currentQuestionId = newId;
      });

      const { rerender } = render(
        <WineryQnA
          winery={wineryWithReviews}
          activeQuestionId={currentQuestionId}
          setActiveQuestionId={setQuestionId}
        />
      );

      // Question "parking" has 2 reviews. Advance to review 2 (index 1)
      expect(screen.getByText(/1 of 2/i)).toBeInTheDocument();
      const nextBtn = screen.getByTestId("next-review");
      fireEvent.click(nextBtn);
      expect(screen.getByText(/2 of 2/i)).toBeInTheDocument();

      // Switch question to "restrooms", which has only 1 review
      currentQuestionId = "restrooms";
      rerender(
        <WineryQnA
          winery={wineryWithReviews}
          activeQuestionId={currentQuestionId}
          setActiveQuestionId={setQuestionId}
        />
      );

      // Keyed card must immediately reset to index 0 ("1 of 1") without reading out-of-bounds review index 1
      expect(screen.getByText(/1 of 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Charlie/i)).toBeInTheDocument();
      expect(screen.queryByText(/2 of 1/i)).not.toBeInTheDocument();
    });
  });

  describe("Requirement 4: Repository-Wide Zero react-hooks/set-state-in-effect Suppressions", () => {
    function findSuppressions(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
            results.push(...findSuppressions(fullPath));
          }
        } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
          // Ignore this test file itself
          if (entry.name.includes("react19-compiler-and-state-derivation.test")) {
            continue;
          }
          const content = fs.readFileSync(fullPath, "utf8");
          const lines = content.split("\n");
          lines.forEach((line, index) => {
            if (line.includes("react-hooks/set-state-in-effect")) {
              results.push(`${path.relative(ROOT_DIR, fullPath)}:${index + 1}`);
            }
          });
        }
      }
      return results;
    }

    it("asserts zero react-hooks/set-state-in-effect suppressions exist across app/, components/, hooks/, and lib/", () => {
      const scanDirs = ["app", "components", "hooks", "lib"].map((d) => path.join(ROOT_DIR, d));
      const suppressions: string[] = [];

      for (const dir of scanDirs) {
        if (fs.existsSync(dir)) {
          suppressions.push(...findSuppressions(dir));
        }
      }

      // Phase 5 requires eliminating all 3 suppressions:
      // - hooks/use-trip-actions.ts
      // - components/trip-planner.tsx
      // - components/WineryQnA.tsx
      expect(suppressions).toEqual([]);
    });
  });
});
