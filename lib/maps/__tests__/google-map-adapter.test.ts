import { GoogleMapAdapter } from "../google-map-adapter";

describe("GoogleMapAdapter", () => {
  let mockGmap: any;
  let mockBounds: any;

  beforeEach(() => {
    mockBounds = {
      getNorthEast: jest.fn().mockReturnValue({ lat: () => 43.0, lng: () => -76.0 }),
      getSouthWest: jest.fn().mockReturnValue({ lat: () => 42.0, lng: () => -77.0 }),
      contains: jest.fn().mockImplementation((coord: any) => {
        return coord.lat >= 42.0 && coord.lat <= 43.0 && coord.lng >= -77.0 && coord.lng <= -76.0;
      }),
    };

    mockGmap = {
      getZoom: jest.fn().mockReturnValue(10),
      setZoom: jest.fn(),
      getCenter: jest.fn().mockReturnValue({ lat: () => 42.5, lng: () => -76.5 }),
      setCenter: jest.fn(),
      fitBounds: jest.fn(),
      getBounds: jest.fn().mockReturnValue(mockBounds),
      addListener: jest.fn().mockImplementation((event: string, handler: Function) => {
        return {
          remove: jest.fn(),
          event,
          handler,
        };
      }),
    };

    (window as any).google = {
      maps: {
        LatLngBounds: jest.fn().mockImplementation((sw: any, ne: any) => ({
          sw,
          ne,
          toString: () => `LatLngBounds(${JSON.stringify(sw)}, ${JSON.stringify(ne)})`,
        })),
      },
    };

    window.open = jest.fn();
  });

  describe("Zoom methods", () => {
    it("delegates getZoom to gmap.getZoom()", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      expect(adapter.getZoom()).toBe(10);
      expect(adapter.zoom).toBe(10);
      expect(mockGmap.getZoom).toHaveBeenCalledTimes(2);
    });

    it("delegates setZoom to gmap.setZoom(zoom)", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      adapter.setZoom(14);
      expect(mockGmap.setZoom).toHaveBeenCalledWith(14);
    });
  });

  describe("Center & Navigation methods", () => {
    it("sets center with { lat, lng } object", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      adapter.setCenter({ lat: 42.8, lng: -76.9 });
      expect(mockGmap.setCenter).toHaveBeenCalledWith({ lat: 42.8, lng: -76.9 });
    });

    it("sets center with Mapbox [lng, lat] coordinate array", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      adapter.setCenter([-76.9, 42.8]);
      expect(mockGmap.setCenter).toHaveBeenCalledWith({ lat: 42.8, lng: -76.9 });
    });

    it("implements flyTo by setting center and zoom from Mapbox options", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      adapter.flyTo({ center: [-76.85, 42.65], zoom: 12 });
      expect(mockGmap.setCenter).toHaveBeenCalledWith({ lat: 42.65, lng: -76.85 });
      expect(mockGmap.setZoom).toHaveBeenCalledWith(12);
    });
  });

  describe("Bounds methods", () => {
    it("handles fitBounds with Mapbox bounding box array [[sw_lng, sw_lat], [ne_lng, ne_lat]]", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      adapter.fitBounds([[-77.1, 42.1], [-76.1, 43.1]]);
      expect((window as any).google.maps.LatLngBounds).toHaveBeenCalledWith(
        { lat: 42.1, lng: -77.1 },
        { lat: 43.1, lng: -76.1 }
      );
      expect(mockGmap.fitBounds).toHaveBeenCalled();
    });

    it("handles fitBounds directly with a Google LatLngBounds object", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      const customBounds = { sw: { lat: 42 }, ne: { lat: 43 } };
      adapter.fitBounds(customBounds as any);
      expect(mockGmap.fitBounds).toHaveBeenCalledWith(customBounds);
    });

    it("returns normalized bounds with getNorthEast, getSouthWest and contains", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      const bounds = adapter.getBounds();
      expect(bounds).not.toBeNull();
      expect(bounds?.getNorthEast()).toEqual({ lat: 43.0, lng: -76.0 });
      expect(bounds?.getSouthWest()).toEqual({ lat: 42.0, lng: -77.0 });

      // contains with array [lng, lat]
      expect(bounds?.contains([-76.5, 42.5])).toBe(true);
      expect(mockBounds.contains).toHaveBeenCalledWith({ lat: 42.5, lng: -76.5 });

      // contains with object { lat, lng }
      expect(bounds?.contains({ lat: 42.5, lng: -76.5 })).toBe(true);
    });

    it("returns null if gmap.getBounds() is falsy", () => {
      mockGmap.getBounds.mockReturnValue(null);
      const adapter = new GoogleMapAdapter(mockGmap);
      expect(adapter.getBounds()).toBeNull();
    });
  });

  describe("Event listeners (on & off)", () => {
    it("maps 'moveend' to Google 'idle' event", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      const callback = jest.fn();
      adapter.on("moveend", callback);

      expect(mockGmap.addListener).toHaveBeenCalledWith("idle", callback);
    });

    it("maps 'click' event wrapping placeId and stop callback", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      const callback = jest.fn();
      let registeredHandler: any;

      mockGmap.addListener.mockImplementation((event: string, handler: Function) => {
        if (event === "click") {
          registeredHandler = handler;
        }
        return { remove: jest.fn() };
      });

      adapter.on("click", callback);
      expect(mockGmap.addListener).toHaveBeenCalledWith("click", expect.any(Function));

      const mockStop = jest.fn();
      registeredHandler({ placeId: "ChIJ_TEST_123", stop: mockStop });

      expect(callback).toHaveBeenCalledWith({
        placeId: "ChIJ_TEST_123",
        stop: expect.any(Function),
      });

      // Execute wrapped stop
      callback.mock.calls[0][0].stop();
      expect(mockStop).toHaveBeenCalled();
    });

    it("removes registered listeners when off is called", () => {
      const removeFn = jest.fn();
      mockGmap.addListener.mockReturnValue({ remove: removeFn });

      const adapter = new GoogleMapAdapter(mockGmap);
      adapter.on("moveend", jest.fn());
      adapter.off("moveend");

      expect(removeFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("openStreetView", () => {
    it("opens Google Maps Street View Universal URL in a new tab", () => {
      const adapter = new GoogleMapAdapter(mockGmap);
      adapter.openStreetView(42.6105, -76.8456);

      expect(window.open).toHaveBeenCalledWith(
        "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=42.6105,-76.8456",
        "_blank",
        "noopener,noreferrer"
      );
    });
  });
});
