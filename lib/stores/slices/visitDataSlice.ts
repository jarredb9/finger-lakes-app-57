import { StateCreator } from 'zustand';
import { Winery, Visit, VisitWithWinery } from '@/lib/types';
import { Base64Photo } from '@/lib/utils/sync-helpers';
import type { VisitState } from '../visitStore';
import {
  getVisitsByWineryHelper,
  hydrateVisitsHelper,
  fetchVisitsForWineryHelper,
  fetchVisitsHelper,
  saveVisitHelper,
  updateVisitHelper,
  deleteVisitHelper,
  injectVisitWithPhotosHelper,
  initializeVisitStoreHelper,
} from './visitDataHelpers';

export interface VisitDataSlice {
  visits: VisitWithWinery[];
  isLoading: boolean;
  error: string | null;
  isSavingVisit: boolean;
  getVisitsByWinery: (wineryIdentifier: number | string) => VisitWithWinery[];
  fetchVisitsForWinery: (wineryIdentifier: number | string) => Promise<VisitWithWinery[]>;
  hydrateVisits: (rawVisits: any[], wineryMeta?: any) => void;
  fetchVisits: (page?: number, refresh?: boolean) => Promise<void>;
  saveVisit: (
    winery: Winery,
    visitData: { visit_date: string; user_review: string; rating: number; photos: (File | Base64Photo)[]; is_private?: boolean }
  ) => Promise<void>;
  updateVisit: (
    visitId: string,
    visitData: Partial<Visit> & { is_private?: boolean },
    newPhotos?: (File | Base64Photo)[],
    photosToDelete?: string[]
  ) => Promise<void>;
  deleteVisit: (visitId: string) => Promise<void>;
  initialize: () => Promise<void>;
  injectVisitWithPhotos?: (
    winery: Winery,
    visitData: { visit_date: string; user_review: string; rating: number; photos: (File | Base64Photo)[] }
  ) => Promise<void>;
}

export const createVisitDataSlice: StateCreator<
  VisitState,
  [],
  [],
  VisitDataSlice
> = (set, get) => ({
  visits: [],
  isLoading: false,
  error: null,
  isSavingVisit: false,

  getVisitsByWinery: (wineryIdentifier) => getVisitsByWineryHelper(get, wineryIdentifier),
  hydrateVisits: (rawVisits, wineryMeta) => hydrateVisitsHelper(set, rawVisits, wineryMeta),
  fetchVisitsForWinery: (wineryIdentifier) => fetchVisitsForWineryHelper(get, wineryIdentifier),
  fetchVisits: (pageNumber, refresh) => fetchVisitsHelper(set, pageNumber, refresh),
  saveVisit: (winery, visitData) => saveVisitHelper(get, set, winery, visitData),
  updateVisit: (visitId, visitData, newPhotos, photosToDelete) =>
    updateVisitHelper(get, set, visitId, visitData, newPhotos, photosToDelete),
  deleteVisit: (visitId) => deleteVisitHelper(get, set, visitId),
  initialize: () => initializeVisitStoreHelper(get, set),
  injectVisitWithPhotos: (winery, visitData) => injectVisitWithPhotosHelper(set, winery, visitData),
});
