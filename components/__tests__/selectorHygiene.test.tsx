import React from "react";
import { render, screen, act, renderHook } from "@testing-library/react";
import { useTripStore } from "@/lib/stores/tripStore";
import { useUserStore } from "@/lib/stores/userStore";
import { useUIStore } from "@/lib/stores/uiStore";
import { useShallow } from "zustand/react/shallow";
import TripCard from "@/components/trip-card";
import { MapControls } from "@/components/map/map-controls";
import MapView from "@/components/map/MapView";
import { Trip, Winery } from "@/lib/types";

// Track render counts across components
let tripCardRenderCount = 0;
let mapControlsChildRenderCount = 0;
let mapViewChildRenderCount = 0;

// Mock child and peripheral components to accurately count parent re-render executions
jest.mock("@/components/TripCardPresentational", () => {
  return function MockTripCardPresentational(props: any) {
    tripCardRenderCount++;
    return (
      <div
        data-testid="mock-trip-card-presentational"
        data-is-updating={String(props.isUpdating)}
        data-is-owner={String(props.isOwner)}
      />
    );
  };
});

jest.mock("@/hooks/use-toast", () => {
  const toastFn = jest.fn();
  return {
    useToast: () => ({ toast: toastFn }),
    toast: toastFn,
  };
});

jest.mock("@/hooks/use-trip-actions", () => {
  const exportFn = jest.fn();
  return {
    useTripActions: () => ({
      currentMembers: [],
      handleExportToMaps: exportFn,
    }),
  };
});

jest.mock("@/components/winery-map-context", () => {
  const contextVal = {
    searchLocation: "",
    setSearchLocation: jest.fn(),
    isSearching: false,
    handleSearchSubmit: jest.fn(),
    handleManualSearchArea: jest.fn(),
    autoSearch: false,
    setAutoSearch: jest.fn(),
    hitApiLimit: false,
    filter: ["all"],
    handleFilterChange: jest.fn(),
  };
  return {
    useWineryMapContext: () => contextVal,
  };
});

jest.mock("@/components/map/map-search-bar", () => ({
  MapSearchBar: () => <div data-testid="mock-map-search-bar" />,
}));

jest.mock("@/components/map/map-filter-toggles", () => ({
  MapFilterToggles: (props: any) => {
    mapControlsChildRenderCount++;
    return (
      <div
        data-testid="mock-map-filter-toggles"
        data-upcoming-count={props.upcomingTrips?.length ?? 0}
        data-selected-trip={props.selectedTrip ? props.selectedTrip.name : "none"}
      />
    );
  },
}));

jest.mock("mapbox-gl", () => ({
  supported: jest.fn().mockReturnValue(true),
}));

jest.mock("react-map-gl/mapbox", () => {
  const MockMap = React.forwardRef((props: any, _ref: any) => {
    mapViewChildRenderCount++;
    return (
      <div data-testid="mock-mapbox-map">
        {props.children}
      </div>
    );
  });
  MockMap.displayName = "MockMapboxMap";
  return {
    __esModule: true,
    default: MockMap,
    Source: ({ children }: any) => <div>{children}</div>,
    Layer: () => <div />,
  };
});

jest.mock("@/components/map/google-map-fallback", () => ({
  GoogleMapFallback: () => <div data-testid="google-map-fallback-stub" />,
}));

describe("ST-10: Component Store Subscriptions & Selector Hygiene", () => {
  const baseTrip: Trip = {
    id: 101,
    user_id: "user-1",
    name: "Seneca Wine Trail",
    trip_date: "2026-10-15",
    wineries: [],
  };

  const otherTrip: Trip = {
    id: 202,
    user_id: "user-2",
    name: "Keuka Lake Tour",
    trip_date: "2026-10-20",
    wineries: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tripCardRenderCount = 0;
    mapControlsChildRenderCount = 0;
    mapViewChildRenderCount = 0;

    // Reset store states to predictable baseline
    useTripStore.setState({
      trips: [baseTrip],
      upcomingTrips: [baseTrip],
      tripsForDate: [],
      selectedTrip: null,
      page: 1,
      hasMore: true,
      isSaving: false,
      isLoading: false,
      error: null,
    });

    useUserStore.setState({
      user: { id: "user-1", email: "tester@example.com" } as any,
      isLoading: false,
    });

    useUIStore.setState({
      isModalOpen: false,
      activeModal: null,
      activeWineryId: null,
      isSidebarOpen: false,
    });
  });

  describe("TripCard Selector Hygiene (ST-10)", () => {
    it("does not re-render when unrelated tripStore state changes (tripsForDate, page)", () => {
      render(<TripCard trip={baseTrip} />);
      const initialRenders = tripCardRenderCount;

      // Mutate unrelated store properties that TripCard does not consume
      act(() => {
        useTripStore.setState({
          tripsForDate: [otherTrip],
          page: 2,
          hasMore: false,
        });
      });

      // Target invariant: selective subscriptions prevent re-render cascades
      expect(tripCardRenderCount).toBe(initialRenders);
    });

    it("does not re-render when uiStore modal state changes", () => {
      render(<TripCard trip={baseTrip} />);
      const initialRenders = tripCardRenderCount;

      // Mutate UI store active modal state (TripCard only consumes stable action dispatchers)
      act(() => {
        useUIStore.setState({
          isModalOpen: true,
          activeModal: { type: "winery_notes" },
          activeWineryId: "42",
        });
      });

      expect(tripCardRenderCount).toBe(initialRenders);
    });

    it("does not re-render when unrelated userStore state changes (error)", () => {
      render(<TripCard trip={baseTrip} />);
      const initialRenders = tripCardRenderCount;

      // Mutate unrelated userStore state (TripCard only consumes user and isLoading)
      act(() => {
        useUserStore.setState({
          error: "Auth refresh error",
        } as any);
      });

      expect(tripCardRenderCount).toBe(initialRenders);
    });

    it("re-renders when subscribed tripStore state changes (isSaving)", () => {
      render(<TripCard trip={baseTrip} />);
      const initialRenders = tripCardRenderCount;

      // Mutate isSaving which TripCard passes down as isUpdating to TripCardPresentational
      act(() => {
        useTripStore.setState({ isSaving: true });
      });

      expect(tripCardRenderCount).toBe(initialRenders + 1);
      expect(screen.getByTestId("mock-trip-card-presentational")).toHaveAttribute(
        "data-is-updating",
        "true"
      );
    });
  });

  describe("MapControls Selector Hygiene (ST-10)", () => {
    it("does not re-render when unrelated tripStore state changes (isSaving, tripsForDate)", () => {
      render(<MapControls />);
      expect(mapControlsChildRenderCount).toBe(1);

      // Mutate unrelated tripStore properties (MapControls only consumes upcomingTrips & selectedTrip)
      act(() => {
        useTripStore.setState({
          isSaving: true,
          tripsForDate: [otherTrip],
          page: 3,
        });
      });

      expect(mapControlsChildRenderCount).toBe(1);
    });

    it("re-renders when subscribed state changes (upcomingTrips, selectedTrip)", () => {
      render(<MapControls />);
      expect(mapControlsChildRenderCount).toBe(1);

      // Mutate subscribed selectedTrip
      act(() => {
        useTripStore.setState({ selectedTrip: otherTrip });
      });

      expect(mapControlsChildRenderCount).toBe(2);
      expect(screen.getByTestId("mock-map-filter-toggles")).toHaveAttribute(
        "data-selected-trip",
        "Keuka Lake Tour"
      );
    });
  });

  describe("MapView Selector Hygiene (ST-10)", () => {
    it("does not re-render when uiStore state changes (isModalOpen, activeModal)", () => {
      const sampleWinery: Winery = {
        id: 1,
        name: "Ravines",
        address: "Geneva",
        latitude: 42.8,
        longitude: -76.9,
      } as any;

      render(
        <MapView
          discoveredWineries={[sampleWinery]}
          visitedWineries={[]}
          wishlistWineries={[]}
          favoriteWineries={[]}
          filter={["all"]}
          onMarkerClick={jest.fn()}
        />
      );
      expect(mapViewChildRenderCount).toBe(1);

      // MapView only consumes closeWineryModal action; modal state mutations must not trigger canvas re-render
      act(() => {
        useUIStore.setState({
          isModalOpen: true,
          activeModal: { type: "share" },
        });
      });

      expect(mapViewChildRenderCount).toBe(1);
    });
  });

  describe("useShallow and Selector Equality Mechanics (ST-10)", () => {
    it("useShallow prevents re-render on unrelated store changes when returning multi-property object", () => {
      let renderCount = 0;

      const { result } = renderHook(() => {
        renderCount++;
        return useTripStore(
          useShallow((s) => ({
            upcomingTrips: s.upcomingTrips,
            selectedTrip: s.selectedTrip,
          }))
        );
      });

      expect(renderCount).toBe(1);
      expect(result.current.upcomingTrips).toHaveLength(1);

      // Mutate an unrelated property in tripStore
      act(() => {
        useTripStore.setState({ isSaving: true, tripsForDate: [otherTrip] });
      });

      // useShallow performs shallow equality on the returned object keys and skips re-render
      expect(renderCount).toBe(1);
    });

    it("demonstrates naive object selector re-rendering without useShallow", () => {
      let naiveRenderCount = 0;

      // Without useShallow, returning a new object literal triggers subscriber notification on every state change
      renderHook(() => {
        naiveRenderCount++;
        return useTripStore((s) => ({
          upcomingTrips: s.upcomingTrips,
          selectedTrip: s.selectedTrip,
        }));
      });

      expect(naiveRenderCount).toBe(1);

      act(() => {
        useTripStore.setState({ isSaving: true });
      });

      // Naive selector fails shallow equality because a fresh object reference is returned
      expect(naiveRenderCount).toBe(2);
    });

    it("useShallow prevents re-render when array reference changes but shallow elements are identical", () => {
      let renderCount = 0;
      const initialUpcoming = [baseTrip];
      useTripStore.setState({ upcomingTrips: initialUpcoming });

      const { result } = renderHook(() => {
        renderCount++;
        return useTripStore(
          useShallow((s) => s.upcomingTrips)
        );
      });

      expect(renderCount).toBe(1);

      // Set a brand new array reference with the exact same items
      act(() => {
        useTripStore.setState({ upcomingTrips: [...initialUpcoming] });
      });

      // useShallow compares array elements shallowly (same reference item) and avoids triggering re-render
      expect(renderCount).toBe(1);
      expect(result.current[0].id).toBe(101);
    });
  });
});
