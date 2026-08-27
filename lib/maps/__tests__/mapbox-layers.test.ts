import {
  clusterLayer,
  clusterCountLayer,
  unclusteredPointLayer,
  MAP_STYLES,
  PIN_COLORS,
} from "../mapbox-layers";

describe("mapbox-layers", () => {
  describe("MAP_STYLES", () => {
    it("exports valid Mapbox style URIs for streets and outdoors", () => {
      expect(MAP_STYLES.streets).toBe("mapbox://styles/mapbox/streets-v12");
      expect(MAP_STYLES.outdoors).toBe("mapbox://styles/mapbox/outdoors-v12");
    });
  });

  describe("PIN_COLORS", () => {
    it("contains color hex codes for all winery categories and trips", () => {
      expect(PIN_COLORS.favorite).toBe("#eab308");
      expect(PIN_COLORS.visited).toBe("#16a34a");
      expect(PIN_COLORS.wishlist).toBe("#a855f7");
      expect(PIN_COLORS.discovered).toBe("#6b7280");
      expect(PIN_COLORS.trip).toBe("#f97316");
    });
  });

  describe("clusterLayer", () => {
    it("has correct configuration for clustered circles", () => {
      expect(clusterLayer.id).toBe("clusters");
      expect(clusterLayer.type).toBe("circle");
      expect(clusterLayer.filter).toEqual(["has", "point_count"]);
      expect(clusterLayer.paint).toBeDefined();
      expect(clusterLayer.paint["circle-stroke-color"]).toBe("#ffffff");
      expect(clusterLayer.paint["circle-stroke-width"]).toBe(2);
      expect(Array.isArray(clusterLayer.paint["circle-color"])).toBe(true);
      expect(Array.isArray(clusterLayer.paint["circle-radius"])).toBe(true);
    });
  });

  describe("clusterCountLayer", () => {
    it("has correct configuration for cluster text count labels", () => {
      expect(clusterCountLayer.id).toBe("cluster-count");
      expect(clusterCountLayer.type).toBe("symbol");
      expect(clusterCountLayer.filter).toEqual(["has", "point_count"]);
      expect(clusterCountLayer.layout).toBeDefined();
      expect(clusterCountLayer.layout["text-field"]).toEqual(["get", "point_count_abbreviated"]);
      expect(clusterCountLayer.layout["text-size"]).toBe(12);
      expect(clusterCountLayer.paint["text-color"]).toBe("#ffffff");
    });
  });

  describe("unclusteredPointLayer", () => {
    it("has correct configuration for individual unclustered winery pins", () => {
      expect(unclusteredPointLayer.id).toBe("unclustered-point");
      expect(unclusteredPointLayer.type).toBe("circle");
      expect(unclusteredPointLayer.filter).toEqual(["!", ["has", "point_count"]]);
      expect(unclusteredPointLayer.paint).toBeDefined();
      expect(unclusteredPointLayer.paint["circle-radius"]).toBe(7);
      expect(unclusteredPointLayer.paint["circle-stroke-width"]).toBe(1.5);
      expect(unclusteredPointLayer.paint["circle-stroke-color"]).toBe("#ffffff");
      
      const colorExpression = unclusteredPointLayer.paint["circle-color"] as any[];
      expect(colorExpression[0]).toBe("match");
      expect(colorExpression[1]).toEqual(["get", "type"]);
      expect(colorExpression).toContain(PIN_COLORS.trip);
      expect(colorExpression).toContain(PIN_COLORS.favorite);
      expect(colorExpression).toContain(PIN_COLORS.visited);
      expect(colorExpression).toContain(PIN_COLORS.wishlist);
      expect(colorExpression).toContain(PIN_COLORS.discovered);
    });
  });
});
