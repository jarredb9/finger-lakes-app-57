export class GoogleMapAdapter {
  public gmap: any;

  constructor(gmap: any) {
    this.gmap = gmap;
  }

  get zoom(): number {
    return 0;
  }

  getZoom(): number {
    return 0;
  }

  setZoom(_zoom: number): void {}

  setCenter(_center: { lat: number; lng: number } | [number, number]): void {}

  flyTo(_options: { center: [number, number]; zoom: number }): void {}

  fitBounds(_bounds: [[number, number], [number, number]] | any, _options?: any): void {}

  getBounds(): any {
    return null;
  }

  on(_event: string, _callback: (...args: any[]) => void): void {}

  off(_event: string, _callback?: (...args: any[]) => void): void {}

  openStreetView(_lat: number, _lng: number): void {}
}
