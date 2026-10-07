/** @jest-environment node */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MapMarkerRpc } from '@/lib/types';
import * as dotenv from 'dotenv';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

jest.setTimeout(25000);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('Database Optimization Integration tests failed to start: Missing credentials in process.env');
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

describe('Database Optimization RPC & RLS Integration Contracts', () => {
  let user1: { id: string; email: string; client: SupabaseClient };
  let user2: { id: string; email: string; client: SupabaseClient };
  let testWineryId: number;
  let testUnenrichedWineryId: number;
  const testPlaceId = `test-db-opt-${Date.now()}`;

  const createAuthenticatedUser = async () => {
    const email = `db-opt-${crypto.randomUUID()}@example.com`;
    const password = crypto.randomUUID();

    const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !user) throw createError;

    const client = createClient(supabaseUrl!, anonKey!, {
      auth: { persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    return { id: user.id, email, client };
  };

  beforeAll(async () => {
    user1 = await createAuthenticatedUser();
    user2 = await createAuthenticatedUser();

    // Create an enriched temporary winery for tests
    const { data: winery, error: wineryError } = await adminClient
      .from('wineries')
      .insert({
        name: 'DB Optimization Test Winery',
        address: '123 Test St, Geneva, NY 14456',
        google_place_id: testPlaceId,
        latitude: 42.8864,
        longitude: -76.9897,
        google_rating: 4.8,
        user_rating_count: 125,
        allows_dogs: true,
        good_for_children: false,
        outdoor_seating: true,
        has_ev_charging: true,
        enrichment_tier: 'enriched',
      })
      .select('id')
      .single();

    if (wineryError || !winery) throw wineryError;
    testWineryId = winery.id;

    // Create an un-enriched temporary winery for tests
    const { data: unenrichedWinery, error: unenrichedError } = await adminClient
      .from('wineries')
      .insert({
        name: 'DB Optimization Un-enriched Winery',
        address: '456 Test Ave, Geneva, NY 14456',
        google_place_id: `${testPlaceId}-unenriched`,
        latitude: 42.8870,
        longitude: -76.9900,
      })
      .select('id')
      .single();

    if (unenrichedError || !unenrichedWinery) throw unenrichedError;
    testUnenrichedWineryId = unenrichedWinery.id;
  });

  afterAll(async () => {
    if (user1) await adminClient.auth.admin.deleteUser(user1.id);
    if (user2) await adminClient.auth.admin.deleteUser(user2.id);
    if (testWineryId) {
      await adminClient.from('wineries').delete().eq('id', testWineryId);
    }
    if (testUnenrichedWineryId) {
      await adminClient.from('wineries').delete().eq('id', testUnenrichedWineryId);
    }
  });

  describe('get_map_markers RPC Execution (BE-07)', () => {
    it('should execute get_map_markers accurately for an authenticated user', async () => {
      // Add favorite and visit for user1
      await adminClient.from('favorites').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        is_private: false,
      });
      await adminClient.from('visits').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        visit_date: '2026-09-02',
        is_private: false,
      });

      const { data, error } = await user1.client.rpc('get_map_markers', {
        p_user_id: user1.id,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      const testMarker = data.find((m: any) => m.id === testWineryId);
      expect(testMarker).toBeDefined();
      expect(testMarker.is_favorite).toBe(true);
      expect(testMarker.user_visited).toBe(true);
      expect(testMarker.on_wishlist).toBe(false);
    });

    it('should return ratings, user_rating_count, vibe tags, and enrichment_tier in marker payload', async () => {
      const { data, error } = await user1.client.rpc('get_map_markers', {
        p_user_id: user1.id,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);

      const enrichedMarker = data.find((m: MapMarkerRpc) => m.id === testWineryId);
      expect(enrichedMarker).toBeDefined();
      expect(enrichedMarker.google_rating).toBe(4.8);
      expect(enrichedMarker.user_rating_count).toBe(125);
      expect(enrichedMarker.allows_dogs).toBe(true);
      expect(enrichedMarker.good_for_children).toBe(false);
      expect(enrichedMarker.outdoor_seating).toBe(true);
      expect(enrichedMarker.has_ev_charging).toBe(true);
      expect(enrichedMarker.enrichment_tier).toBe('enriched');

      const unenrichedMarker = data.find((m: MapMarkerRpc) => m.id === testUnenrichedWineryId);
      expect(unenrichedMarker).toBeDefined();
      expect(unenrichedMarker.google_rating).toBeNull();
      expect(unenrichedMarker.user_rating_count).toBeNull();
      expect(unenrichedMarker.allows_dogs).toBeNull();
      expect(unenrichedMarker.good_for_children).toBeNull();
      expect(unenrichedMarker.outdoor_seating).toBeNull();
      expect(unenrichedMarker.has_ev_charging).toBeNull();
      expect(unenrichedMarker.enrichment_tier).toBe('basic');
    });
  });

  describe('is_visible_to_viewer RLS Contract (BE-09)', () => {
    it('should enforce RLS correctly: allow public visits and hide private visits from other users', async () => {
      // 1. user1 adds a public visit
      const { data: pubVisit, error: pubError } = await adminClient.from('visits').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        visit_date: '2026-09-01',
        is_private: false,
      }).select().single();
      expect(pubError).toBeNull();

      // 2. user1 adds a private visit
      const { data: privVisit, error: privError } = await adminClient.from('visits').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        visit_date: '2026-09-02',
        is_private: true,
      }).select().single();
      expect(privError).toBeNull();

      // 3. user2 queries visits
      const { data: viewerVisits, error: viewerError } = await user2.client
        .from('visits')
        .select('id, user_id, is_private')
        .in('id', [pubVisit.id, privVisit.id]);

      expect(viewerError).toBeNull();
      const visibleIds = (viewerVisits || []).map((v: any) => v.id);
      expect(visibleIds).toContain(pubVisit.id);
      expect(visibleIds).not.toContain(privVisit.id);

      // 4. user1 queries visits (sees both)
      const { data: ownerVisits, error: ownerError } = await user1.client
        .from('visits')
        .select('id')
        .in('id', [pubVisit.id, privVisit.id]);

      expect(ownerError).toBeNull();
      const ownerIds = (ownerVisits || []).map((v: any) => v.id);
      expect(ownerIds).toContain(pubVisit.id);
      expect(ownerIds).toContain(privVisit.id);
    });
  });
});
