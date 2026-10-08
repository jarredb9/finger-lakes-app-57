import { render, screen, fireEvent, act } from "@testing-library/react";
import { useWineryFilter } from "@/hooks/use-winery-filter";
import { MapFilterToggles } from "@/components/map/map-filter-toggles";
import MapView from "@/components/map/MapView";
import WinerySearchResults from "@/components/map/WinerySearchResults";
import { useMapStore } from "@/lib/stores/mapStore";
import { useWineryStore } from "@/lib/stores/wineryStore";
import { Winery } from "@/lib/types";

let lastSourceProps: any = null;

// Mock mapbox-gl and react-map-gl/mapbox for MapView
jest.mock("mapbox-gl", () => ({
  supported: jest.fn().mockReturnValue(true),
}));

jest.mock("react-map-gl/mapbox", () => {
  const React = require("react");
  const MockMap = React.forwardRef((props: any, ref: any) => {
    const instance = React.useMemo(
      () => ({
        getMap: jest.fn().mockReturnValue({
          queryRenderedFeatures: jest.fn().mockReturnValue([]),
          getSource: jest.fn().mockReturnValue({
            getClusterExpansionZoom: jest.fn(),
          }),
          easeTo: jest.fn(),
        }),
      }),
      []
    );
    React.useImperativeHandle(ref, () => instance, [instance]);
    return <div data-testid="mapbox-map">{props.children}</div>;
  });
  MockMap.displayName = "MockMapboxMap";

  return {
    __esModule: true,
    default: MockMap,
    Source: (props: any) => {
      React.useEffect(() => {
        lastSourceProps = props;
      });
      return <div data-testid="mapbox-source">{props.children}</div>;
    },
    Layer: (props: any) => <div data-testid={`mapbox-layer-${props.id}`} />,
  };
});

jest.mock("../map/google-map-fallback", () => ({
  GoogleMapFallback: () => <div data-testid="google-map-fallback-stub" />,
}));

// Mock Next.js Image
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt} />;
  },
}));

function ExploreFilterIntegrationHarness() {
  const { mapWineries, listResultsInView, filter, handleFilterChange } = useWineryFilter();

  return (
    <div>
      <MapFilterToggles
        filter={filter}
        handleFilterChange={handleFilterChange}
      />
      <MapView
        discoveredWineries={mapWineries.discovered}
        visitedWineries={mapWineries.visited}
        wishlistWineries={mapWineries.wishlist}
        favoriteWineries={mapWineries.favorites}
        filter={filter}
        onMarkerClick={jest.fn()}
      />
      <WinerySearchResults
        listResultsInView={listResultsInView}
        isSearching={false}
        handleOpenModal={jest.fn()}
      />
    </div>
  );
}

describe("Vibe Tag Filtering Component Integration (Map Pins & Sidebar List)", () => {
  const dogFriendlyWinery: Winery = {
    id: "winery-dog" as any,
    name: "Dog Haven Winery",
    address: "100 Dog Way, Geneva, NY",
    latitude: 42.8,
    longitude: -76.9,
    rating: 4.8,
    userRatingCount: 210,
    allows_dogs: true,
    good_for_children: false,
    outdoor_seating: true,
    has_ev_charging: null,
    visits: [],
  };

  const kidFriendlyWinery: Winery = {
    id: "winery-kid" as any,
    name: "Family Fun Winery",
    address: "200 Kid Path, Penn Yan, NY",
    latitude: 42.82,
    longitude: -76.92,
    rating: 4.5,
    userRatingCount: 95,
    allows_dogs: false,
    good_for_children: true,
    outdoor_seating: true,
    has_ev_charging: true,
    visits: [],
  };

  const unenrichedWinery: Winery = {
    id: "winery-unenriched" as any,
    name: "Unenriched Cellars",
    address: "300 Unknown Rd, Dundee, NY",
    latitude: 42.84,
    longitude: -76.94,
    rating: 4.2,
    userRatingCount: 30,
    allows_dogs: null,
    good_for_children: null,
    outdoor_seating: null,
    has_ev_charging: null,
    visits: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    lastSourceProps = null;
    useMapStore.getState().reset();
    useWineryStore.setState({
      persistentWineries: [dogFriendlyWinery, kidFriendlyWinery, unenrichedWinery],
      isLoading: false,
      error: null,
    });
  });

  it("filters both map pins and sidebar list when a Vibe Tag filter toggle is clicked", () => {
    render(<ExploreFilterIntegrationHarness />);

    // Initial state: all 3 wineries appear in sidebar and map pins
    expect(screen.getByText("Dog Haven Winery")).toBeInTheDocument();
    expect(screen.getByText("Family Fun Winery")).toBeInTheDocument();
    expect(screen.getByText("Unenriched Cellars")).toBeInTheDocument();
    expect(lastSourceProps?.data?.features?.length).toBe(3);

    // Click Dog Friendly toggle chip
    const dogFriendlyChip = screen.getByRole("button", { name: /dog friendly/i });
    fireEvent.click(dogFriendlyChip);

    // Sidebar list should update to only show dog-friendly winery
    expect(screen.getByText("Dog Haven Winery")).toBeInTheDocument();
    expect(screen.queryByText("Family Fun Winery")).not.toBeInTheDocument();
    expect(screen.queryByText("Unenriched Cellars")).not.toBeInTheDocument();

    // Map pins must strictly match === true (length 1)
    const features = lastSourceProps?.data?.features || [];
    expect(features.length).toBe(1);
    expect(features[0].properties.id).toBe("winery-dog");
  });

  it("strictly excludes un-enriched wineries (null) and non-matching wineries (false) on initial load with active Vibe Tag filter", () => {
    act(() => {
      useMapStore.setState({ filter: ["all", "hasEvCharging"] });
    });

    render(<ExploreFilterIntegrationHarness />);

    // Sidebar list: only EV Charging winery should be visible
    expect(screen.getByText("Family Fun Winery")).toBeInTheDocument();
    expect(screen.queryByText("Dog Haven Winery")).not.toBeInTheDocument();
    expect(screen.queryByText("Unenriched Cellars")).not.toBeInTheDocument();

    // Map pins: only EV Charging winery should be in GeoJSON features
    const features = lastSourceProps?.data?.features || [];
    expect(features.length).toBe(1);
    expect(features[0].properties.id).toBe("winery-kid");
  });

  it("enforces strict conjunction (AND) across multiple active Vibe Tag filters for map pins and sidebar list", () => {
    act(() => {
      useMapStore.setState({ filter: ["all", "allowsDogs", "outdoorSeating"] });
    });

    render(<ExploreFilterIntegrationHarness />);

    // Only dogFriendlyWinery has BOTH allows_dogs === true AND outdoor_seating === true
    expect(screen.getByText("Dog Haven Winery")).toBeInTheDocument();
    expect(screen.queryByText("Family Fun Winery")).not.toBeInTheDocument();
    expect(screen.queryByText("Unenriched Cellars")).not.toBeInTheDocument();

    const features = lastSourceProps?.data?.features || [];
    expect(features.length).toBe(1);
    expect(features[0].properties.id).toBe("winery-dog");
  });
});
