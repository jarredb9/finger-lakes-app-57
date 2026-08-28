/**
 * Google Maps to Mapbox API Adapter Layer
 * Allows the rest of the application (hooks/stores) to interact with 
 * the Google Map instance as if it were a Mapbox map instance.
 */
export class GoogleMapAdapter {
  readonly gmap: any;
  private readonly listeners = new globalThis.Map<string, any[]>();

  constructor(gmap: any) {
    this.gmap = gmap;
  }

  get zoom(): number {
    return this.gmap.getZoom();
  }

  getZoom(): number {
    return this.gmap.getZoom();
  }

  setZoom(zoom: number): void {
    this.gmap.setZoom(zoom);
  }

  setCenter(center: { lat: number; lng: number } | [number, number]): void {
    if (Array.isArray(center)) {
      this.gmap.setCenter({ lat: center[1], lng: center[0] });
    } else {
      this.gmap.setCenter(center);
    }
  }

  flyTo(options: { center: [number, number]; zoom: number }): void {
    this.gmap.setCenter({ lat: options.center[1], lng: options.center[0] });
    this.gmap.setZoom(options.zoom);
  }

  fitBounds(bounds: [[number, number], [number, number]] | any, _options?: any): void {
    if (Array.isArray(bounds)) {
      const googleBounds = new window.google.maps.LatLngBounds(
        { lat: bounds[0][1], lng: bounds[0][0] },
        { lat: bounds[1][1], lng: bounds[1][0] }
      );
      this.gmap.fitBounds(googleBounds);
    } else {
      this.gmap.fitBounds(bounds);
    }
  }

  getBounds() {
    const gbounds = this.gmap.getBounds();
    if (!gbounds) return null;
    const ne = gbounds.getNorthEast();
    const sw = gbounds.getSouthWest();
    return {
      getNorthEast: () => ({
        lat: typeof ne.lat === "function" ? ne.lat() : ne.lat,
        lng: typeof ne.lng === "function" ? ne.lng() : ne.lng,
      }),
      getSouthWest: () => ({
        lat: typeof sw.lat === "function" ? sw.lat() : sw.lat,
        lng: typeof sw.lng === "function" ? sw.lng() : sw.lng,
      }),
      contains: (coord: any) => {
        if (Array.isArray(coord)) {
          return gbounds.contains({ lat: coord[1], lng: coord[0] });
        }
        return gbounds.contains(coord);
      },
    };
  }

  on(event: string, callback: (...args: any[]) => void): void {
    let handle: any = null;
    if (event === "moveend") {
      handle = this.gmap.addListener("idle", callback);
    } else if (event === "click") {
      handle = this.gmap.addListener("click", (e: any) => {
        callback({
          placeId: e.placeId,
          stop: () => e.stop && e.stop(),
        });
      });
    }
    if (handle) {
      const list = this.listeners.get(event) || [];
      list.push(handle);
      this.listeners.set(event, list);
    }
  }

  off(event: string, _callback?: (...args: any[]) => void): void {
    const list = this.listeners.get(event);
    if (list) {
      list.forEach((handle: any) => handle.remove());
      this.listeners.delete(event);
    }
  }

  openStreetView(lat: number, lng: number): void {
    if (typeof window !== "undefined") {
      const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }
}
