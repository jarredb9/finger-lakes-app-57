import fs from "fs";
import path from "path";
import { render, screen, act } from "@testing-library/react";
import mapboxgl from "mapbox-gl";
import { Winery } from "@/lib/types";

// Captured props from mocked react-map-gl components
let lastSourceProps: any = null;
let lastMapProps: any = null;

jest.mock("mapbox-gl", () => ({
  supported: jest.fn().mockReturnValue(true),
}));

jest.mock("react-map-gl/mapbox", () => {
  const React = require("react");
  const MockMap = React.forwardRef((props: any, ref: any) => {
    React.useEffect(() => {
      lastMapProps = props;
    });

    const instance = React.useMemo(
      () => ({
        getMap: jest.fn().mockReturnValue({
          queryRenderedFeatures: jest.fn().mockReturnValue([]),
          getSource: jest.fn().mockReturnValue({
            getClusterExpansionZoom: jest.fn(),
          }),
          easeTo: jest.fn(),
          resize: jest.fn(),
        }),
      }),
      []
    );

    React.useImperativeHandle(ref, () => instance, [instance]);

    return (
      <div data-testid="mapbox-map">
        {props.children}
      </div>
    );
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

jest.mock("../google-map-fallback", () => ({
  GoogleMapFallback: () => <div data-testid="google-map-fallback-stub" />,
  __esModule: true,
  default: () => <div data-testid="google-map-fallback-stub" />,
}));

const ROOT_DIR = process.cwd();

describe("Map Engine Bundle Isolation & Dynamic Fallback Loading (Phase 2 Task 1)", () => {
  const validWinery: Winery = {
    id: "winery-1" as any,
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
    lastSourceProps = null;
    lastMapProps = null;
    (mapboxgl.supported as jest.Mock).mockReturnValue(true);
  });

  describe("Requirement 1: Mapbox CSS Isolation", () => {
    it("asserts app/layout.tsx does not import mapbox-gl/dist/mapbox-gl.css", () => {
      const layoutPath = path.join(ROOT_DIR, "app/layout.tsx");
      expect(fs.existsSync(layoutPath)).toBe(true);

      const layoutContent = fs.readFileSync(layoutPath, "utf-8");
      const hasMapboxCss = /import\s+['"]mapbox-gl\/dist\/mapbox-gl\.css['"]/.test(layoutContent);

      expect(hasMapboxCss).toBe(false);
    });
  });

  describe("Requirement 2: Google Maps Fallback Dynamic Loading", () => {
    it("verifies components/map/MapView.tsx loads GoogleMapFallback via next/dynamic and avoids static import", () => {
      const mapViewPath = path.join(ROOT_DIR, "components/map/MapView.tsx");
      expect(fs.existsSync(mapViewPath)).toBe(true);

      const mapViewContent = fs.readFileSync(mapViewPath, "utf-8");

      // Must not statically import GoogleMapFallback
      const hasStaticImport = /import\s+(?:{\s*GoogleMapFallback\s*}|GoogleMapFallback)\s+from\s+['"]\.\/google-map-fallback['"]/.test(
        mapViewContent
      );
      expect(hasStaticImport).toBe(false);

      // Must use dynamic import with exact kebab-case ./google-map-fallback
      const usesNextDynamic = /dynamic\s*\(\s*\(\)\s*=>\s*import\s*\(\s*['"]\.\/google-map-fallback['"]\s*\)/.test(
        mapViewContent
      );
      expect(usesNextDynamic).toBe(true);
    });
  });

  describe("Requirement 3: WebGL & Runtime Error Recovery", () => {
    it("transitions gracefully to GoogleMapFallback when Mapbox emits a WebGL context creation failure or runtime error", async () => {
      const { MapView } = await import("../MapView");

      render(
        <MapView
          discoveredWineries={[validWinery]}
          visitedWineries={[]}
          wishlistWineries={[]}
          favoriteWineries={[]}
          filter={["all"]}
          onMarkerClick={jest.fn()}
        />
      );

      // Mapbox map should initially be rendered
      expect(screen.getByTestId("mapbox-map")).toBeInTheDocument();

      // Trigger WebGL failure via onError callback on Map component
      expect(lastMapProps?.onError).toBeDefined();

      act(() => {
        lastMapProps.onError({
          error: new Error("Could not create WebGL context"),
        });
      });

      // Should transition to GoogleMapFallback without crashing, preserving canvas container
      const canvas = screen.getByTestId("map-view-canvas");
      expect(canvas).toBeInTheDocument();
      expect(await screen.findByTestId("google-map-fallback-stub")).toBeInTheDocument();
      expect(screen.queryByTestId("mapbox-map")).not.toBeInTheDocument();
    });
  });

  describe("Requirement 4: GeoJSON Coordinate Sanitization", () => {
    it("excludes NaN, non-finite, and invalid coordinates from wineriesGeoJSON generation", async () => {
      const { MapView } = await import("../MapView");

      const nanLatWinery: Winery = {
        ...validWinery,
        id: "winery-nan-lat" as any,
        name: "NaN Lat Winery",
        latitude: NaN,
        longitude: -76.9,
      };

      const nanLngWinery: Winery = {
        ...validWinery,
        id: "winery-nan-lng" as any,
        name: "NaN Lng Winery",
        latitude: 42.8,
        longitude: NaN,
      };

      const infinityWinery: Winery = {
        ...validWinery,
        id: "winery-inf" as any,
        name: "Infinity Winery",
        latitude: Infinity,
        longitude: -76.9,
      };

      const nullCoordsWinery: Winery = {
        ...validWinery,
        id: "winery-null" as any,
        name: "Null Coords Winery",
        latitude: null as any,
        longitude: undefined as any,
      };

      const stringInvalidWinery: Winery = {
        ...validWinery,
        id: "winery-str" as any,
        name: "String Coords Winery",
        latitude: "invalid" as any,
        longitude: -76.9,
      };

      render(
        <MapView
          discoveredWineries={[
            validWinery,
            nanLatWinery,
            nanLngWinery,
            infinityWinery,
            nullCoordsWinery,
            stringInvalidWinery,
          ]}
          visitedWineries={[]}
          wishlistWineries={[]}
          favoriteWineries={[]}
          filter={["all"]}
          onMarkerClick={jest.fn()}
        />
      );

      expect(lastSourceProps).not.toBeNull();
      const features = lastSourceProps.data?.features || [];

      // Only the single valid winery should be included in the GeoJSON features
      expect(features.length).toBe(1);
      expect(features[0].properties.id).toBe(validWinery.id);

      // Verify every coordinate pair in features consists of strictly finite numbers
      features.forEach((feature: any) => {
        const [lng, lat] = feature.geometry.coordinates;
        expect(Number.isFinite(lng)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
        expect(isNaN(lng)).toBe(false);
        expect(isNaN(lat)).toBe(false);
      });
    });
  });
});
