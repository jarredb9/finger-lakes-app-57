import { Page } from '@playwright/test';
import { getTodayLocal } from '@/lib/utils';
import { createMockVisitWithWinery } from '@/lib/test-utils/fixtures';
import { MapMarkerRpc, WineryDbId, GooglePlaceId } from '@/lib/types';
import { MockMapsState, createDefaultMockState } from '../types';
import { MOCK_MARKERS } from '../utils/mock-wineries';

export class VisitsHandler {
  private state: MockMapsState;
  private currentUserId: string = 'test-user-id';
  realVisitsEnabled = false;
  private markers: MapMarkerRpc[];

  constructor(private page: Page, state?: MockMapsState, markers: MapMarkerRpc[] = MOCK_MARKERS) {
    this.state = state || createDefaultMockState();
    this.markers = markers;
  }

  getState(): MockMapsState {
    return this.state;
  }

  setCurrentUserId(id: string) {
    const oldId = this.currentUserId;
    this.currentUserId = id;

    if (this.state.visits) {
      this.state.visits.forEach(v => {
        if (v.user_id === oldId) v.user_id = this.currentUserId;
      });
    }
  }

  async useRealVisits() {
    this.realVisitsEnabled = true;
  }

  initDefaultState() {
    if (!this.state.visits) {
      const mockVisit = createMockVisitWithWinery({
        wineryId: 'ch-67890-mock-winery-2' as GooglePlaceId,
        wineryName: 'Vineyard of Illusion',
        visit_date: '2020-01-01',
        user_review: 'A classic mock visit from the past.',
      });
      this.state.visits = [{
        visit_id: 12345,
        user_id: mockVisit.user_id || this.currentUserId,
        visit_date: mockVisit.visit_date,
        user_review: mockVisit.user_review || null,
        rating: mockVisit.rating || null,
        photos: mockVisit.photos || [],
        winery_id: mockVisit.winery_id || 2 as WineryDbId,
        winery_name: mockVisit.wineryName || 'Vineyard of Illusion',
        google_place_id: mockVisit.wineryId || 'ch-67890-mock-winery-2' as GooglePlaceId,
        winery_address: mockVisit.wineries.address,
        latitude: mockVisit.wineries.latitude,
        longitude: mockVisit.wineries.longitude,
        friend_visits: [],
        updated_at: new Date().toISOString(),
      }];
    }
  }

  async registerRoutes(options: { currentUserId?: string } = {}) {
    if (options.currentUserId) {
      this.setCurrentUserId(options.currentUserId);
    }

    this.initDefaultState();

    const commonHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400',
    };

    const markers = this.markers;
    const todayCA = getTodayLocal();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    let supabaseHost = 'localhost:54321';
    try {
      const supabaseUrlObj = new URL(supabaseUrl);
      supabaseHost = supabaseUrlObj.host.replace(/\./g, '\\.');
    } catch {
      // Fallback
    }

    const visitsRpcRegex = new RegExp(
      `${supabaseHost}/.*rpc/(log_visit|update_visit|delete_visit|get_paginated_visits|get_paginated_visits_with_winery_and_friends)`
    );

    await this.page.context().route(visitsRpcRegex, async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      if (this.realVisitsEnabled) {
        return route.fallback();
      }

      if (url.includes('log_visit')) {
        const postData = JSON.parse(req.postData() || '{}');
        const wineryData = postData.p_winery_data || {};
        const visitData = postData.p_visit_data || {};
        const idempotencyKey = postData.p_idempotency_key || null;

        if (idempotencyKey && this.state.visits) {
          const existing = this.state.visits.find(v => v.idempotency_key === idempotencyKey);
          if (existing) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify({ visit_id: existing.visit_id, winery_id: existing.google_place_id }),
            });
          }
        }

        const newId = 1000 + Math.floor(Math.random() * 9000);
        const wineryId = wineryData.id;
        const winery = markers.find(m => m.id === wineryId || m.google_place_id === wineryId);

        if (!this.state.visits) this.state.visits = [];

        const newVisit: any = {
          visit_id: newId,
          user_id: this.currentUserId,
          visit_date: visitData.visit_date || todayCA,
          user_review: visitData.user_review || null,
          rating: visitData.rating || null,
          photos: visitData.photos || [],
          winery_id: winery?.id || 123,
          winery_name: winery?.name || wineryData.name || 'Unknown Winery',
          google_place_id: winery?.google_place_id || wineryId,
          winery_address: winery?.address || wineryData.address || 'Unknown Address',
          latitude: winery?.latitude || wineryData.latitude || 42.7,
          longitude: winery?.longitude || wineryData.longitude || -76.9,
          friend_visits: [],
          updated_at: new Date(Date.now() + 5000).toISOString(),
          idempotency_key: idempotencyKey,
          is_private: !!visitData.is_private,
        };
        this.state.visits.push(newVisit);

        if (!this.state.activityFeed) this.state.activityFeed = [];
        this.state.activityFeed.push({
          activity_type: 'visit',
          created_at: new Date().toISOString(),
          activity_user_id: this.currentUserId,
          user_name: 'Test User',
          user_email: 'test@example.com',
          winery_id: newVisit.winery_id,
          winery_name: newVisit.winery_name,
          latitude: newVisit.latitude,
          longitude: newVisit.longitude,
          visit_rating: newVisit.rating,
          visit_review: newVisit.user_review,
          visit_photos: newVisit.photos,
        });

        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ visit_id: newId, winery_id: wineryId }) });
      }

      if (url.includes('delete_visit')) {
        const postData = JSON.parse(req.postData() || '{}');
        const visitId = Number(postData.p_visit_id);
        if (this.state.visits) {
          this.state.visits = this.state.visits.filter(v => Number(v.visit_id) !== visitId);
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('update_visit')) {
        const postData = JSON.parse(req.postData() || '{}');
        const visitId = Number(postData.p_visit_id);
        const visitData = postData.p_visit_data || {};
        const idempotencyKey = postData.p_idempotency_key || null;

        if (idempotencyKey && this.state.visits) {
          const existing = this.state.visits.find(v => v.idempotency_key === idempotencyKey);
          if (existing) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify(existing),
            });
          }
        }

        let updatedObj = {};
        if (this.state.visits) {
          const visit = this.state.visits.find(v => Number(v.visit_id) === visitId);
          if (visit) {
            visit.user_review = visitData.user_review !== undefined ? visitData.user_review : visit.user_review;
            visit.rating = visitData.rating !== undefined ? visitData.rating : visit.rating;
            visit.photos = visitData.photos !== undefined ? visitData.photos : visit.photos;
            visit.updated_at = new Date().toISOString();
            if (idempotencyKey) {
              visit.idempotency_key = idempotencyKey;
            }
            updatedObj = visit;
          }
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(updatedObj) });
      }

      if (url.includes('get_paginated_visits') || url.includes('get_paginated_visits_with_winery_and_friends')) {
        const visits = [...(this.state.visits || [])].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(visits) });
      }

      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ message: `Mock not implemented for RPC: ${url}` }),
      });
    });
  }
}
