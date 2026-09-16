export {};

declare module "react-map-gl/mapbox" {
  export const Source: any;
  export const Layer: any;
  export const Marker: any;
  export const MapProvider: any;
  export const useMap: () => { current: any };
  export type MapRef = any;
  const Map: any;
  export default Map;
}

declare global {
  interface Window {
    useFriendStore?: import('@/lib/stores/friendStore').useFriendStore;
    useMapStore?: import('@/lib/stores/mapStore').useMapStore;
    useSyncStore?: import('@/lib/stores/syncStore').useSyncStore;
    useTripStore?: import('@/lib/stores/tripStore').useTripStore;
    useUIStore?: import('@/lib/stores/uiStore').useUIStore;
    useUserStore?: import('@/lib/stores/userStore').useUserStore;
    useVisitStore?: import('@/lib/stores/visitStore').useVisitStore;
    useWineryStore?: import('@/lib/stores/wineryStore').useWineryStore;
    useWineryDataStore?: import('@/lib/stores/wineryStore').useWineryStore;
    SyncService?: typeof import('@/lib/services/syncService').SyncService;
    createSupabaseClient?: typeof import('@/utils/supabase/client').createClient;
    supabase?: ReturnType<typeof import('@/utils/supabase/client').createClient>;
    standardizeWineryData?: typeof import('@/lib/utils/winery').standardizeWineryData;
    getWineryVibeTags?: typeof import('@/lib/utils/winery').getWineryVibeTags;
    idbKeyVal?: {
      get: (key: string) => Promise<any>;
      set: (key: string, val: any) => Promise<any>;
    };
    _E2E_FULL_DRAWER?: boolean;
    _E2E_RELOAD?: () => void;
    _STORES_EXPOSED?: boolean;
    _E2E_SKIP_WINERY_INJECTION?: boolean;
    _E2E_SKIP_DETAILS_MOCK?: boolean;
    _E2E_ENABLE_REAL_SYNC?: boolean;
    _DIAGNOSTIC_LOGGING?: boolean;
    opera?: string;
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  }

  var _PWA_UPDATING: boolean | undefined;
}
