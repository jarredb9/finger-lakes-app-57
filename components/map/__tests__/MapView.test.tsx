import { render, screen, fireEvent } from "@testing-library/react";
import MapView from "../MapView";
import { useMapStore } from "@/lib/stores/mapStore";
import mapboxgl from "mapbox-gl";
import { Winery } from "@/lib/types";

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

    return (
      <div data-testid="mapbox-map" onClick={props.onClick}>
        <button data-testid="trigger-onload-btn" onClick={() => props.onLoad?.()} />
        {props.children}
      </div>
    );
  });
  MockMap.displayName = "MockMapboxMap";

  return {
    __esModule: true,
    default: MockMap,
    Source: ({ children }: any) => <div data-testid="mapbox-source">{children}</div>,
    Layer: (props: any) => <div data-testid={`mapbox-layer-${props.id}`} />,
  };
});

jest.mock("../google-map-fallback", () => ({
  GoogleMapFallback: () => <div data-testid="google-map-fallback-stub" />,
}));

describe("MapView Container Component", () => {
  const sampleWinery: Winery = {
    id: "winery-mapview-1" as any,
    name: "Ravines Wine Cellars",
    address: "4000 NY-14, Geneva, NY 14456",
    latitude: 42.8211,
    longitude: -76.9744,
    phone: "315-781-7007",
    website: "https://ravineswine.com",
    rating: 4.8,
    userRatingCount: 350,
    visits: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useMapStore.getState().reset();
    (mapboxgl.supported as jest.Mock).mockReturnValue(true);
  });

  it("renders Mapbox map container with ready state when Mapbox is supported", () => {
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

    const mapContainer = screen.getByTestId("map-view-canvas");
    expect(mapContainer).toBeInTheDocument();
    expect(mapContainer).toHaveAttribute("data-state", "ready");
    expect(screen.getByTestId("mapbox-map")).toBeInTheDocument();
    expect(screen.getByTestId("mapbox-source")).toBeInTheDocument();
    expect(screen.getByTestId("mapbox-layer-clusters")).toBeInTheDocument();
    expect(screen.getByTestId("mapbox-layer-cluster-count")).toBeInTheDocument();
    expect(screen.getByTestId("mapbox-layer-unclustered-point")).toBeInTheDocument();
  });

  it("renders GoogleMapFallback when Mapbox is not supported (maintaining DOM stability)", () => {
    (mapboxgl.supported as jest.Mock).mockReturnValue(false);

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

    const mapContainer = screen.getByTestId("map-view-canvas");
    expect(mapContainer).toBeInTheDocument();
    expect(mapContainer).toHaveAttribute("data-state", "ready");
    expect(screen.getByTestId("google-map-fallback-stub")).toBeInTheDocument();
  });

  it("attaches openStreetView contract to map instance and syncs with useMapStore on load", () => {
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

    const onLoadBtn = screen.getByTestId("trigger-onload-btn");
    fireEvent.click(onLoadBtn);

    const registeredMap = useMapStore.getState().map;
    expect(registeredMap).not.toBeNull();
    expect(typeof registeredMap.openStreetView).toBe("function");
  });

  it("toggles map styles using style switcher buttons", () => {
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

    const outdoorsBtn = screen.getByRole("button", { name: /outdoors/i });
    const streetsBtn = screen.getByRole("button", { name: /streets/i });

    expect(outdoorsBtn).toBeInTheDocument();
    expect(streetsBtn).toBeInTheDocument();

    fireEvent.click(outdoorsBtn);
    fireEvent.click(streetsBtn);
  });
});
