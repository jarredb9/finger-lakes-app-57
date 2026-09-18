 
import { Page } from '@playwright/test';
import { createMockTrip } from '@/lib/test-utils/fixtures';
import { MockMapsState, createDefaultMockState } from '../types';

export class TripsHandler {
  private state: MockMapsState;
  private currentUserId: string = 'test-user-id';
  realTripsEnabled = false;

  constructor(private page: Page, state?: MockMapsState) {
    this.state = state || createDefaultMockState();
  }

  getState(): MockMapsState {
    return this.state;
  }

  setCurrentUserId(id: string) {
    const oldId = this.currentUserId;
    this.currentUserId = id;

    if (this.state.trips) {
      this.state.trips.forEach(t => {
        if (t.user_id === oldId) t.user_id = this.currentUserId;
        t.members?.forEach(m => { if (m.id === oldId) m.id = this.currentUserId; });
      });
    }
  }

  async useRealTrips() {
    this.realTripsEnabled = true;
  }

  async failTrips() {
    const commonHeaders = {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400',
    };
    await this.page.context().route(/\/rest\/v1\/trips/, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ message: 'Database Connection Failed' }),
      });
    });
  }

  initDefaultState() {
    const todayCA = new Date().toLocaleDateString('en-CA');

    if (!this.state.trips) {
      this.state.trips = [
        createMockTrip({
          id: 999,
          name: 'Collaboration Trip',
          trip_date: todayCA,
          user_id: this.currentUserId,
          members: [
            { id: this.currentUserId, role: 'owner', status: 'joined', name: 'Test User', email: 'test@example.com' },
            { id: 'user-b-id', role: 'member', status: 'joined', name: 'User B', email: 'user-b@example.com' },
          ],
        }),
      ];
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

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    let supabaseHost = 'localhost:54321';
    try {
      const supabaseUrlObj = new URL(supabaseUrl);
      supabaseHost = supabaseUrlObj.host.replace(/\./g, '\\.');
    } catch {
      // Fallback
    }

    // 1. Trips RPC Handler
    const tripsRpcRegex = new RegExp(
      `${supabaseHost}/.*rpc/(get_trip_details|get_trips_for_date|create_trip|create_trip_with_winery|delete_trip|reorder_trip_wineries|update_trip_winery_notes|add_trip_member_by_email|add_winery_to_trip|remove_winery_from_trip|add_winery_to_trips|definitely_does_not_exist_rpc_12345)`
    );

    await this.page.context().route(tripsRpcRegex, async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });

      if (this.realTripsEnabled) {
        return route.fallback();
      }

      if (url.includes('definitely_does_not_exist_rpc_12345')) {
        return route.fulfill({
          status: 404,
          contentType: 'application/json',
          headers: commonHeaders,
          body: JSON.stringify({ code: '42883', message: 'function definitely_does_not_exist_rpc_12345() does not exist' }),
        });
      }

      if (url.includes('get_trips_for_date')) {
        const postData = JSON.parse(req.postData() || '{}');
        const targetDate = postData.target_date;
        const trips = (this.state.trips || []).filter(t => t.trip_date === targetDate);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(trips) });
      }

      if (url.includes('create_trip_with_winery')) {
        const postData = JSON.parse(req.postData() || '{}');
        const idempotencyKey = postData.p_idempotency_key || null;

        if (idempotencyKey && this.state.trips) {
          const existing = this.state.trips.find(t => (t as any).idempotency_key === idempotencyKey);
          if (existing) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify({ trip_id: existing.id, winery_id: (existing as any).winery_id || 1 }),
            });
          }
        }

        const newId = Math.floor(Math.random() * 10000);
        const wineryData = postData.p_winery_data || {};
        const wineryId = wineryData.id || 1;

        const newTrip = createMockTrip({
          id: newId,
          name: postData.p_trip_name,
          trip_date: postData.p_trip_date,
          user_id: this.currentUserId,
          updated_at: new Date(Date.now() + 5000).toISOString(),
        });
        (newTrip as any).idempotency_key = idempotencyKey;
        (newTrip as any).winery_id = wineryId;

        if (!this.state.trips) this.state.trips = [];
        this.state.trips.push(newTrip);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ trip_id: newId, winery_id: wineryId }) });
      }

      if (url.includes('create_trip')) {
        const postData = JSON.parse(req.postData() || '{}');
        const idempotencyKey = postData.p_idempotency_key || null;

        if (idempotencyKey && this.state.trips) {
          const existing = this.state.trips.find(t => (t as any).idempotency_key === idempotencyKey);
          if (existing) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              headers: commonHeaders,
              body: JSON.stringify({
                id: existing.id,
                user_id: existing.user_id,
                trip_date: existing.trip_date,
                name: existing.name,
              }),
            });
          }
        }

        const newId = Math.floor(Math.random() * 10000);
        const newTrip = createMockTrip({
          id: newId,
          name: postData.p_name,
          trip_date: postData.p_trip_date,
          user_id: this.currentUserId,
          updated_at: new Date(Date.now() + 5000).toISOString(),
        });
        (newTrip as any).idempotency_key = idempotencyKey;

        if (!this.state.trips) this.state.trips = [];
        this.state.trips.push(newTrip);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ id: newId, user_id: this.currentUserId, trip_date: postData.p_trip_date, name: postData.p_name }) });
      }

      if (url.includes('delete_trip')) {
        const postData = JSON.parse(req.postData() || '{}');
        const tripId = Number(postData.p_trip_id);
        if (this.state.trips) {
          this.state.trips = this.state.trips.filter(t => Number(t.id) !== tripId);
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('add_trip_member_by_email')) {
        const postData = JSON.parse(req.postData() || '{}');
        const tripId = postData.p_trip_id;
        const email = postData.p_email;
        if (this.state.trips) {
          const trip = this.state.trips.find(t => Number(t.id) === Number(tripId));
          if (trip) {
            if (!trip.members) trip.members = [];
            if (!trip.members.some(m => m.email?.toLowerCase() === email.toLowerCase())) {
              trip.members.push({
                id: `mock-member-${Math.floor(Math.random() * 10000)}`,
                email: email,
                name: email.split('@')[0],
                role: 'member',
                status: 'invited',
              });
              trip.updated_at = new Date().toISOString();
            }
          }
        }
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ success: true }) });
      }

      if (url.includes('get_trip_details')) {
        const postData = JSON.parse(req.postData() || '{}');
        const requestedId = postData.p_trip_id;
        const trips = this.state.trips || [];
        const found = trips.find(t => Number(t.id) === Number(requestedId));
        if (!found) return route.fulfill({ status: 404, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify({ error: `Trip ID ${requestedId} not found` }) });
        return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body: JSON.stringify(found) });
      }

      return route.fulfill({
        status: 501,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({ message: `Mock not implemented for RPC: ${url}` }),
      });
    });

    // 2. REST Trips Table Handler
    await this.page.context().route(new RegExp(`${supabaseHost}/rest/v1/trips`), async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
      if (this.realTripsEnabled) return route.fallback();

      if (req.method() === 'PATCH') {
        const postData = JSON.parse(req.postData() || '{}');
        const idMatch = req.url().match(/id=eq\.(\d+)/);
        if (idMatch && this.state.trips) {
          const tripId = parseInt(idMatch[1], 10);
          const trip = this.state.trips.find(t => Number(t.id) === tripId);
          if (trip) {
            Object.assign(trip, postData);
            trip.updated_at = new Date().toISOString();
          }
        }
        return route.fulfill({ status: 204, headers: commonHeaders });
      }

      const trips = this.state.trips || [];
      const transformed = trips.map(t => ({
        ...t,
        trip_wineries: [{ count: t.wineries?.length || 0 }],
        trip_members: (t.members || []).map(m => ({
          user_id: m.id,
          role: m.role,
          status: m.status,
          profiles: {
            name: m.name,
            email: m.email,
          },
        })),
      }));

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(transformed),
        headers: { ...commonHeaders, 'x-total-count': transformed.length.toString() },
      });
    });
  }
}
