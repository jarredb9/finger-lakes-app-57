/** @jest-environment jsdom */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { createMockWinery, createMockVisit } from '@/lib/test-utils/fixtures';
import { getTodayLocal } from '@/lib/utils';

// Load env vars immediately at the top of the file
// In CI, .env.local won't exist, so we use the provided process.env
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

// Increase timeout for remote integration tests
jest.setTimeout(15000);

// Integration test for Supabase RPCs
// These tests run against the live Supabase instance.
// They use authenticated clients to properly test logic that relies on auth.uid().

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase RPC Integration tests failed to start: Missing credentials in process.env');
}

// Admin client for setup/teardown
const adminClient = createClient(supabaseUrl, serviceRoleKey);

describe('Supabase RPC Integration Tests', () => {
    let user1: { id: string; email: string; client: SupabaseClient };
    let user2: { id: string; email: string; client: SupabaseClient };
    let user3: { id: string; email: string; client: SupabaseClient };
    const createdWineryIds: string[] = [];

    const createAuthenticatedUser = async () => {
      const email = `rpc-test-${crypto.randomUUID()}@example.com`;
      const password = crypto.randomUUID();
      
      // 1. Create user via admin
      const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (createError || !user) throw createError;

      // 2. Create client and sign in with persistence disabled to avoid sharing state
      const client = createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false }
      });
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      // Verify identity
      const { data: { user: identifiedUser } } = await client.auth.getUser();
      if (identifiedUser?.id !== user.id) throw new Error("Identity mismatch after sign-in");

      return { id: user.id, email, client };
    };

    beforeAll(async () => {
      user1 = await createAuthenticatedUser();
      user2 = await createAuthenticatedUser();
      user3 = await createAuthenticatedUser();
    });

    afterAll(async () => {
      if (user1) await adminClient.auth.admin.deleteUser(user1.id);
      if (user2) await adminClient.auth.admin.deleteUser(user2.id);
      if (user3) await adminClient.auth.admin.deleteUser(user3.id);
      
      if (createdWineryIds.length > 0) {
        await adminClient.from('wineries').delete().in('google_place_id', createdWineryIds);
      }
    });

    describe('Trip Management RPCs', () => {
      it('should create a trip with a winery atomically using create_trip_with_winery', async () => {
        const { data: tripData, error: tripError } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Solo Trip',
          p_trip_date: new Date().toISOString().split('T')[0],
          p_winery_data: {
            id: `mock-winery-${crypto.randomUUID()}`,
            name: 'Solo Winery',
            address: '456 Solo St',
            lat: 43.0,
            lng: -77.5,
            rating: 4.0
          }
        });
        expect(tripError).toBeNull();
        expect(tripData).toHaveProperty('trip_id');
      });

      it('should allow trip members from trip_members table to fetch details via get_trip_details', async () => {
        // 1. User 1 creates a trip and includes User 2 as a member atomically
        const { data: tripData, error: tripError } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Shared Trip',
          p_trip_date: new Date().toISOString().split('T')[0],
          p_winery_data: {
            id: `mock-winery-${crypto.randomUUID()}`,
            name: 'Test Winery',
            address: '123 Test St',
            lat: 42.5,
            lng: -77.0,
            rating: 4.5
          },
          p_members: [user1.id, user2.id] // Atomic addition of member
        });
        expect(tripError).toBeNull();
        const tripId = tripData.trip_id;

        // 2. User 2 attempts to fetch trip details
        const { data: details, error: detailsError } = await user2.client.rpc('get_trip_details', {
          p_trip_id: tripId
        });

        expect(detailsError).toBeNull();
        expect(details).not.toBeNull();
        expect(details.id).toBe(tripId);
      });

      it('should persist numeric coordinates when add_winery_to_trip is called with latitude and longitude keys (without lat/lng)', async () => {
        // 1. Create a base trip with user1 and register base winery for teardown
        const basePlaceId = `mock-winery-base-${crypto.randomUUID()}`;
        createdWineryIds.push(basePlaceId);
        const { data: tripData, error: tripError } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Coord Test Trip',
          p_trip_date: getTodayLocal(),
          p_winery_data: {
            id: basePlaceId,
            name: 'Base Winery',
            address: '100 Base Way',
            lat: 42.5,
            lng: -76.9,
            rating: 4.5
          }
        });
        expect(tripError).toBeNull();
        const tripId = tripData.trip_id;

        // 2. Call add_winery_to_trip using standardized latitude / longitude keys (NO lat/lng keys)
        const wineryPlaceId = `mock-winery-coord-${crypto.randomUUID()}`;
        createdWineryIds.push(wineryPlaceId);
        const wineryData = {
          id: wineryPlaceId,
          name: 'Standardized Coord Winery',
          address: '200 Finger Lakes Rd',
          latitude: 42.7485,
          longitude: -76.8921,
          phone: '555-123-4567',
          website: 'https://example.com',
          rating: 4.8
        };

        const { data: addData, error: addError } = await user1.client.rpc('add_winery_to_trip', {
          p_trip_id: tripId,
          p_winery_data: wineryData,
          p_notes: 'Stop 2 via standardized coordinates'
        });

        expect(addError).toBeNull();
        expect(addData).toHaveProperty('success', true);
        expect(addData).toHaveProperty('winery_id');
        const wineryId = addData.winery_id;

        // 3. Inspect public.wineries - must persist numeric coordinates rather than NULL
        const { data: wineryRecord, error: wineryError } = await adminClient
          .from('wineries')
          .select('id, google_place_id, name, latitude, longitude')
          .eq('id', wineryId)
          .single();

        expect(wineryError).toBeNull();
        expect(wineryRecord).not.toBeNull();
        expect(wineryRecord!.latitude).toBe(42.7485);
        expect(wineryRecord!.longitude).toBe(-76.8921);

        // 4. Verify stop association in public.trip_wineries
        const { data: twRecord, error: twError } = await adminClient
          .from('trip_wineries')
          .select('trip_id, winery_id, notes, visit_order')
          .eq('trip_id', tripId)
          .eq('winery_id', wineryId)
          .single();

        expect(twError).toBeNull();
        expect(twRecord!.notes).toBe('Stop 2 via standardized coordinates');
      });

      it('should maintain backward compatibility and persist numeric coordinates when add_winery_to_trip is called with legacy lat and lng keys', async () => {
        // 1. Create a base trip with user1 and register legacy base winery for teardown
        const legacyBasePlaceId = `mock-winery-legacy-base-${crypto.randomUUID()}`;
        createdWineryIds.push(legacyBasePlaceId);
        const { data: tripData, error: tripError } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Legacy Coord Trip',
          p_trip_date: getTodayLocal(),
          p_winery_data: {
            id: legacyBasePlaceId,
            name: 'Legacy Base Winery',
            address: '100 Base Way',
            lat: 42.5,
            lng: -76.9
          }
        });
        expect(tripError).toBeNull();
        const tripId = tripData.trip_id;

        // 2. Call add_winery_to_trip using legacy lat / lng keys
        const wineryPlaceId = `mock-winery-legacy-${crypto.randomUUID()}`;
        createdWineryIds.push(wineryPlaceId);
        const wineryData = {
          id: wineryPlaceId,
          name: 'Legacy Coord Winery',
          address: '300 Legacy Rd',
          lat: 42.6123,
          lng: -76.7456
        };

        const { data: addData, error: addError } = await user1.client.rpc('add_winery_to_trip', {
          p_trip_id: tripId,
          p_winery_data: wineryData,
          p_notes: 'Stop 2 via legacy coordinates'
        });

        expect(addError).toBeNull();
        expect(addData).toHaveProperty('success', true);
        const wineryId = addData.winery_id;

        // 3. Inspect public.wineries - legacy keys must persist
        const { data: wineryRecord, error: wineryError } = await adminClient
          .from('wineries')
          .select('id, latitude, longitude')
          .eq('id', wineryId)
          .single();

        expect(wineryError).toBeNull();
        expect(wineryRecord).not.toBeNull();
        expect(wineryRecord!.latitude).toBe(42.6123);
        expect(wineryRecord!.longitude).toBe(-76.7456);
      });
    });

    describe('Visit Logging RPCs', () => {
      it('should log a visit atomically using log_visit', async () => {
        const mockWinery = createMockWinery();
        const wineryData = {
          id: `mock-winery-visit-${crypto.randomUUID()}`,
          name: mockWinery.name,
          address: mockWinery.address,
          latitude: mockWinery.latitude,
          longitude: mockWinery.longitude,
          rating: mockWinery.rating
        };
        createdWineryIds.push(wineryData.id);

        const mockVisit = createMockVisit();
        const visitData = {
          visit_date: mockVisit.visit_date,
          rating: mockVisit.rating,
          user_review: mockVisit.user_review
        };

        const { data, error } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryData,
          p_visit_data: visitData
        });

        expect(error).toBeNull();
        expect(data).toHaveProperty('visit_id');

        // Verify visit exists and belongs to user1
        const { data: visit } = await adminClient.from('visits').select('*').eq('id', data.visit_id).single();
        expect(visit.user_id).toBe(user1.id);
        expect(visit.rating).toBe(mockVisit.rating);
      });

      it('should automatically delete existing wishlist entry when log_visit is called for a winery', async () => {
        const mockWinery = createMockWinery();
        const wineryPlaceId = `mock-winery-autoclear-${crypto.randomUUID()}`;
        const wineryData = {
          id: wineryPlaceId,
          name: mockWinery.name,
          address: mockWinery.address,
          latitude: mockWinery.latitude,
          longitude: mockWinery.longitude,
          rating: mockWinery.rating
        };
        createdWineryIds.push(wineryPlaceId);

        // 1. Add winery to user1 wishlist via toggle_wishlist RPC
        const { data: wishData, error: wishError } = await user1.client.rpc('toggle_wishlist', {
          p_winery_data: wineryData
        });
        expect(wishError).toBeNull();
        expect(wishData).toHaveProperty('winery_id');
        expect(wishData.on_wishlist).toBe(true);
        const wineryDbId = wishData.winery_id;

        // 2. Verify wishlist entry exists in public.wishlist
        const { data: wishlistBefore, error: checkBeforeError } = await adminClient
          .from('wishlist')
          .select('*')
          .eq('user_id', user1.id)
          .eq('winery_id', wineryDbId);
        expect(checkBeforeError).toBeNull();
        expect(wishlistBefore).toHaveLength(1);

        // 3. Log a visit for the wishlisted winery
        const mockVisit = createMockVisit();
        const visitData = {
          visit_date: mockVisit.visit_date,
          rating: mockVisit.rating,
          user_review: mockVisit.user_review
        };

        const { data: logVisitData, error: logVisitError } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryData,
          p_visit_data: visitData
        });
        expect(logVisitError).toBeNull();
        expect(logVisitData).toHaveProperty('visit_id');

        // 4. Assert wishlist record was deleted
        const { data: wishlistAfter, error: checkAfterError } = await adminClient
          .from('wishlist')
          .select('*')
          .eq('user_id', user1.id)
          .eq('winery_id', wineryDbId);
        expect(checkAfterError).toBeNull();
        expect(wishlistAfter).toHaveLength(0);
      });

      it('should succeed safely when logging a second visit to an already cleared winery', async () => {
        const mockWinery = createMockWinery();
        const wineryPlaceId = `mock-winery-second-visit-${crypto.randomUUID()}`;
        const wineryData = {
          id: wineryPlaceId,
          name: mockWinery.name,
          address: mockWinery.address,
          latitude: mockWinery.latitude,
          longitude: mockWinery.longitude,
          rating: mockWinery.rating
        };
        createdWineryIds.push(wineryPlaceId);

        // 1. Add winery to user1 wishlist
        const { data: wishData, error: wishError } = await user1.client.rpc('toggle_wishlist', {
          p_winery_data: wineryData
        });
        expect(wishError).toBeNull();
        expect(wishData).toHaveProperty('winery_id');
        expect(wishData.on_wishlist).toBe(true);
        const wineryDbId = wishData.winery_id;

        // 2. Log first visit
        const mockVisit1 = createMockVisit();
        const { data: firstVisitData, error: firstVisitError } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryData,
          p_visit_data: {
            visit_date: mockVisit1.visit_date,
            rating: mockVisit1.rating,
            user_review: 'First visit'
          }
        });
        expect(firstVisitError).toBeNull();
        expect(firstVisitData).toHaveProperty('visit_id');

        // 3. Log a second visit to the same winery
        const mockVisit2 = createMockVisit();
        const { data: secondVisitData, error: secondVisitError } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryData,
          p_visit_data: {
            visit_date: mockVisit2.visit_date,
            rating: mockVisit2.rating,
            user_review: 'Second visit'
          }
        });
        expect(secondVisitError).toBeNull();
        expect(secondVisitData).toHaveProperty('visit_id');
        expect(secondVisitData.visit_id).not.toBe(firstVisitData.visit_id);

        // 4. Assert wishlist remains cleared
        const { data: wishlistAfter, error: checkAfterError } = await adminClient
          .from('wishlist')
          .select('*')
          .eq('user_id', user1.id)
          .eq('winery_id', wineryDbId);
        expect(checkAfterError).toBeNull();
        expect(wishlistAfter).toHaveLength(0);
      });

      it('should not restore a winery to public.wishlist when a visit is deleted', async () => {
        const mockWinery = createMockWinery();
        const wineryPlaceId = `mock-winery-delete-visit-${crypto.randomUUID()}`;
        const wineryData = {
          id: wineryPlaceId,
          name: mockWinery.name,
          address: mockWinery.address,
          latitude: mockWinery.latitude,
          longitude: mockWinery.longitude,
          rating: mockWinery.rating
        };
        createdWineryIds.push(wineryPlaceId);

        // 1. Add winery to wishlist
        const { data: wishData, error: wishError } = await user1.client.rpc('toggle_wishlist', {
          p_winery_data: wineryData
        });
        expect(wishError).toBeNull();
        expect(wishData).toHaveProperty('winery_id');
        expect(wishData.on_wishlist).toBe(true);
        const wineryDbId = wishData.winery_id;

        // 2. Log visit
        const mockVisit = createMockVisit();
        const { data: visitData, error: visitError } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryData,
          p_visit_data: {
            visit_date: mockVisit.visit_date,
            rating: mockVisit.rating,
            user_review: 'Visit before deletion'
          }
        });
        expect(visitError).toBeNull();
        const visitId = visitData.visit_id;

        // 3. Delete visit via delete_visit RPC
        const { data: deleteData, error: deleteError } = await user1.client.rpc('delete_visit', {
          p_visit_id: visitId
        });
        expect(deleteError).toBeNull();
        expect(deleteData).toEqual({ success: true });

        // 4. Verify visit is deleted from public.visits
        const { data: visitInDb } = await adminClient
          .from('visits')
          .select('id')
          .eq('id', visitId)
          .maybeSingle();
        expect(visitInDb).toBeNull();

        // 5. Invariant check: public.wishlist must NOT restore the cleared winery
        const { data: wishlistAfter, error: checkAfterError } = await adminClient
          .from('wishlist')
          .select('*')
          .eq('user_id', user1.id)
          .eq('winery_id', wineryDbId);
        expect(checkAfterError).toBeNull();
        expect(wishlistAfter).toHaveLength(0);
      });
    });

    describe('Social RPCs', () => {
      it('should handle friend request lifecycle', async () => {
        // 1. User 1 sends friend request to User 2 using email
        const { error } = await user1.client.rpc('send_friend_request', {
          p_target_email: user2.email
        });
        expect(error).toBeNull();

        // 2. User 2 accepts using user1's id as p_requester_id
        const { error: acceptError } = await user2.client.rpc('respond_to_friend_request', {
          p_requester_id: user1.id,
          p_accept: true
        });
        expect(acceptError).toBeNull();

        // 3. Verify friendship
        const { data: friend } = await adminClient
          .from('friends')
          .select('*')
          .or(`and(user1_id.eq.${user1.id},user2_id.eq.${user2.id}),and(user1_id.eq.${user2.id},user2_id.eq.${user1.id})`)
          .single();
        expect(friend).not.toBeNull();
      });

      it('should allow friends to view content based on updated is_visible_to_viewer', async () => {
        // 0. Ensure no existing follow/friendship
        await adminClient.from('follows').delete().eq('follower_id', user1.id).eq('following_id', user2.id);
        await adminClient.from('friends').delete().or(`and(user1_id.eq.${user1.id},user2_id.eq.${user2.id}),and(user1_id.eq.${user2.id},user2_id.eq.${user1.id})`);

        // 1. Set user2 to 'friends_only'
        await adminClient.from('profiles').update({ privacy_level: 'friends_only' }).eq('id', user2.id);

        // 2. user1 is NOT a friend
        const { data: visibleBefore } = await user1.client.rpc('is_visible_to_viewer', {
          p_target_user_id: user2.id,
          p_is_item_private: false
        });
        expect(visibleBefore).toBe(false);

        // 3. user1 and user2 become mutual friends
        await adminClient.from('friends').insert({
          user1_id: user1.id,
          user2_id: user2.id,
          status: 'accepted'
        });

        // 4. Verify user1 can now see user2's content
        const { data: visibleAfter } = await user1.client.rpc('is_visible_to_viewer', {
          p_target_user_id: user2.id,
          p_is_item_private: false
        });
        expect(visibleAfter).toBe(true);

        // 5. Cleanup friendship
        await adminClient.from('friends').delete().or(`and(user1_id.eq.${user1.id},user2_id.eq.${user2.id}),and(user1_id.eq.${user2.id},user2_id.eq.${user1.id})`);
      });
    });

    describe('Security & Privilege Hardening', () => {
      const anonClient = createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false }
      });

      it('should reject direct updates to public.wineries by authenticated non-service-role clients', async () => {
        const testPlaceId = `test-winery-${crypto.randomUUID()}`;
        createdWineryIds.push(testPlaceId);

        // 1. Insert via adminClient
        const { error: insertError } = await adminClient.from('wineries').insert({
          google_place_id: testPlaceId,
          name: 'Original Secure Winery',
          address: '123 Safe Path',
          latitude: 42.5,
          longitude: -77.0
        });
        expect(insertError).toBeNull();

        // 2. Authenticated user1 attempts direct update
        const { error: updateError } = await user1.client
          .from('wineries')
          .update({ name: 'Tampered By Authenticated User' })
          .eq('google_place_id', testPlaceId);

        // Expect rejection via 42501 permission denied
        expect(updateError).not.toBeNull();
        expect(updateError?.code).toBe('42501');

        // 3. Verify winery name was not modified
        const { data: winery } = await adminClient
          .from('wineries')
          .select('name')
          .eq('google_place_id', testPlaceId)
          .single();
        expect(winery?.name).toBe('Original Secure Winery');
      });

      it('should deny execution of bulk_upsert_wineries RPC to anonymous and non-service-role clients', async () => {
        const payload = [{
          google_place_id: `test-bulk-${crypto.randomUUID()}`,
          name: 'Malicious Bulk Winery',
          address: '404 Danger Rd',
          latitude: 42.0,
          longitude: -77.0
        }];

        // 1. Anonymous client attempt
        const { error: anonError } = await anonClient.rpc('bulk_upsert_wineries', {
          p_wineries_data: payload
        });
        expect(anonError).not.toBeNull();
        expect(anonError?.code).toBe('42501');

        // 2. Authenticated user attempt
        const { error: authError } = await user1.client.rpc('bulk_upsert_wineries', {
          p_wineries_data: payload
        });
        expect(authError).not.toBeNull();
        expect(authError?.code).toBe('42501');

        // 3. Service role client execution should succeed
        const { error: serviceError } = await adminClient.rpc('bulk_upsert_wineries', {
          p_wineries_data: payload
        });
        expect(serviceError).toBeNull();

        // Cleanup
        createdWineryIds.push(payload[0].google_place_id);
      });

      it('should deny unauthenticated (anon) read access to profiles, wineries, visits, and collections', async () => {
        // Fixture setup: Ensure user1 has data across core tables
        const wineryPlaceId = `test-anon-fixture-${crypto.randomUUID()}`;
        createdWineryIds.push(wineryPlaceId);
        const { data: winery } = await adminClient.from('wineries').insert({
          google_place_id: wineryPlaceId,
          name: 'Fixture Winery for Anon Check',
          address: '100 Anon Rd',
          latitude: 42.5,
          longitude: -77.0
        }).select('id').single();

        await adminClient.from('profiles').upsert({
          id: user1.id,
          email: user1.email,
          name: 'User One',
          privacy_level: 'public'
        });

        if (winery) {
          await adminClient.from('visits').insert({
            user_id: user1.id,
            winery_id: winery.id,
            visit_date: getTodayLocal(),
            rating: 5,
            user_review: 'Great public visit',
            is_private: false
          });

          await adminClient.from('favorites').upsert({
            user_id: user1.id,
            winery_id: winery.id
          });

          await adminClient.from('wishlist').upsert({
            user_id: user1.id,
            winery_id: winery.id
          });
        }

        // 1. Unauthenticated read on profiles
        const { data: profiles, error: profilesError } = await anonClient.from('profiles').select('id, name, email');
        if (profilesError) {
          expect(profilesError.code).toBe('42501');
        } else {
          expect(profiles).toEqual([]);
        }

        // 2. Unauthenticated read on wineries
        const { data: wineries, error: wineriesError } = await anonClient.from('wineries').select('id, name');
        if (wineriesError) {
          expect(wineriesError.code).toBe('42501');
        } else {
          expect(wineries).toEqual([]);
        }

        // 3. Unauthenticated read on visits
        const { data: visits, error: visitsError } = await anonClient.from('visits').select('id, user_review');
        if (visitsError) {
          expect(visitsError.code).toBe('42501');
        } else {
          expect(visits).toEqual([]);
        }

        // 4. Unauthenticated read on favorites
        const { data: favorites, error: favoritesError } = await anonClient.from('favorites').select('*');
        if (favoritesError) {
          expect(favoritesError.code).toBe('42501');
        } else {
          expect(favorites).toEqual([]);
        }

        // 5. Unauthenticated read on wishlist
        const { data: wishlist, error: wishlistError } = await anonClient.from('wishlist').select('*');
        if (wishlistError) {
          expect(wishlistError.code).toBe('42501');
        } else {
          expect(wishlist).toEqual([]);
        }
      });

      it('should reject direct table INSERT on public.wineries by authenticated non-service-role clients', async () => {
        const testPlaceId = `test-direct-insert-${crypto.randomUUID()}`;
        createdWineryIds.push(testPlaceId);

        // Authenticated user1 attempts direct insert
        const { error: insertError } = await user1.client.from('wineries').insert({
          google_place_id: testPlaceId,
          name: 'Direct Malicious Winery',
          address: '123 Fake Rd',
          latitude: 42.5,
          longitude: -77.0
        });

        expect(insertError).not.toBeNull();
        expect(insertError?.code).toBe('42501');

        // Verify record was not inserted
        const { data: winery } = await adminClient
          .from('wineries')
          .select('id')
          .eq('google_place_id', testPlaceId)
          .maybeSingle();
        expect(winery).toBeNull();
      });

      it('should preserve catalog immutability, backfill nulls, and enforce auth in ensure_winery', async () => {
        const placeId = `test-ensure-immutability-${crypto.randomUUID()}`;
        createdWineryIds.push(placeId);

        // 1. Seed canonical winery via adminClient
        const { error: seedError } = await adminClient.from('wineries').insert({
          google_place_id: placeId,
          name: 'Canonical Finger Lakes Winery',
          address: '100 Classic Trail',
          latitude: 42.5000,
          longitude: -76.8000,
          phone: '607-555-0199',
          website: null,
          google_rating: 4.9
        });
        expect(seedError).toBeNull();

        // 2. Tampering attempt via authenticated user
        const { error: tamperError } = await user1.client.rpc('ensure_winery', {
          p_winery_data: {
            google_place_id: placeId,
            name: 'Hacked Winery Name',
            address: '999 Overwrite St',
            latitude: 0.0,
            longitude: 0.0,
            phone: '000-000-0000',
            website: 'https://canonical-flx.example.com',
            rating: 1.0
          }
        });
        expect(tamperError).toBeNull();

        // Inspect record via adminClient
        const { data: wineryAfter } = await adminClient
          .from('wineries')
          .select('name, address, latitude, longitude, phone, website, google_rating')
          .eq('google_place_id', placeId)
          .single();

        expect(wineryAfter?.name).toBe('Canonical Finger Lakes Winery');
        expect(wineryAfter?.address).toBe('100 Classic Trail');
        expect(wineryAfter?.latitude).toBe(42.5000);
        expect(wineryAfter?.longitude).toBe(-76.8000);
        expect(wineryAfter?.phone).toBe('607-555-0199');
        expect(wineryAfter?.website).toBe('https://canonical-flx.example.com');
        expect(wineryAfter?.google_rating).toBe(4.9);

        // 3. Place ID Aliasing (id vs google_place_id)
        const { error: aliasError } = await user1.client.rpc('ensure_winery', {
          p_winery_data: {
            id: placeId,
            name: 'Aliased Name Attempt'
          }
        });
        expect(aliasError).toBeNull();
        const { data: aliasCount } = await adminClient
          .from('wineries')
          .select('id')
          .eq('google_place_id', placeId);
        expect(aliasCount?.length).toBe(1);

        // 4. Unauthenticated access denial
        const { error: anonError } = await anonClient.rpc('ensure_winery', {
          p_winery_data: {
            id: `test-anon-${crypto.randomUUID()}`,
            name: 'Anon Winery'
          }
        });
        expect(anonError).not.toBeNull();
      });

      it('should isolate composite idempotency keys per user and reject unauthenticated execution in log_visit', async () => {
        const sharedKey = crypto.randomUUID();
        const placeIdA = `test-idem-a-${crypto.randomUUID()}`;
        const placeIdB = `test-idem-b-${crypto.randomUUID()}`;
        createdWineryIds.push(placeIdA, placeIdB);

        const wineryA = {
          id: placeIdA,
          google_place_id: placeIdA,
          name: 'Idempotency Winery A',
          address: '1 A Rd',
          latitude: 42.5,
          longitude: -77.0
        };
        const wineryB = {
          id: placeIdB,
          google_place_id: placeIdB,
          name: 'Idempotency Winery B',
          address: '2 B Rd',
          latitude: 42.6,
          longitude: -77.1
        };
        const visitPayload = {
          visit_date: getTodayLocal(),
          rating: 4,
          user_review: 'Great tasting room experience'
        };

        // 1. Unauthenticated Auth Guard
        const { error: anonLogError } = await anonClient.rpc('log_visit', {
          p_winery_data: wineryA,
          p_visit_data: visitPayload,
          p_idempotency_key: sharedKey
        });
        expect(anonLogError).not.toBeNull();

        // 2. User 1 First Write with sharedKey
        const { data: user1Visit, error: user1Error } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryA,
          p_visit_data: visitPayload,
          p_idempotency_key: sharedKey
        });
        expect(user1Error).toBeNull();
        expect(user1Visit).toHaveProperty('visit_id');
        const user1VisitId = (user1Visit as any).visit_id;

        // 3. User 2 Cross-User Write with Same sharedKey
        const { data: user2Visit, error: user2Error } = await user2.client.rpc('log_visit', {
          p_winery_data: wineryB,
          p_visit_data: visitPayload,
          p_idempotency_key: sharedKey
        });
        expect(user2Error).toBeNull();
        expect(user2Visit).toHaveProperty('visit_id');
        const user2VisitId = (user2Visit as any).visit_id;
        expect(user2VisitId).not.toBe(user1VisitId);

        // 4. Database State Verification via adminClient
        const { data: dbVisits } = await adminClient
          .from('visits')
          .select('id, user_id, idempotency_key')
          .eq('idempotency_key', sharedKey);
        expect(dbVisits?.length).toBe(2);
        const userIds = dbVisits?.map(v => v.user_id);
        expect(userIds).toContain(user1.id);
        expect(userIds).toContain(user2.id);

        // 5. Intra-User Replay (True Idempotency)
        const { data: user2Replay, error: replayError } = await user2.client.rpc('log_visit', {
          p_winery_data: wineryB,
          p_visit_data: visitPayload,
          p_idempotency_key: sharedKey
        });
        expect(replayError).toBeNull();
        expect((user2Replay as any)?.visit_id).toBe(user2VisitId);
      });

      it('should redact email address in get_friend_profile_with_visits for non-friends and unauthenticated callers', async () => {
        // Ensure user1 profile exists with user1.email and public privacy
        await adminClient.from('profiles').upsert({
          id: user1.id,
          email: user1.email,
          name: 'User One',
          privacy_level: 'public'
        });

        // Ensure user3 is NOT a friend of user1
        await adminClient.from('friends').delete()
          .or(`and(user_id.eq.${user1.id},friend_id.eq.${user3.id}),and(user_id.eq.${user3.id},friend_id.eq.${user1.id})`);

        // 1. Non-Friend Query
        const { data: nonFriendData, error: nonFriendError } = await user3.client.rpc('get_friend_profile_with_visits', {
          p_friend_id: user1.id
        });
        expect(nonFriendError).toBeNull();
        expect((nonFriendData as any)?.profile?.id).toBe(user1.id);
        expect((nonFriendData as any)?.profile?.email).toBeNull();

        // 2. Unauthenticated Query
        const { data: anonData, error: anonError } = await anonClient.rpc('get_friend_profile_with_visits', {
          p_friend_id: user1.id
        });
        if (anonError) {
          expect(anonError).not.toBeNull();
        } else {
          expect((anonData as any)?.profile).toBeFalsy();
        }

        // 3. Self Query (Owner Visibility)
        const { data: selfData, error: selfError } = await user1.client.rpc('get_friend_profile_with_visits', {
          p_friend_id: user1.id
        });
        expect(selfError).toBeNull();
        expect((selfData as any)?.profile?.email).toBe(user1.email);
      });
    });
});
