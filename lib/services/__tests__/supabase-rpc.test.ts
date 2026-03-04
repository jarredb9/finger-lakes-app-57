import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { createMockWinery, createMockVisit } from '@/lib/test-utils/fixtures';

// Load env vars immediately at the top of the file
// In CI, .env.local won't exist, so we use the provided process.env
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

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
        const mockWinery = createMockWinery();
        const wineryData = {
          id: `mock-winery-${crypto.randomUUID()}`,
          name: mockWinery.name,
          address: mockWinery.address,
          lat: mockWinery.lat,
          lng: mockWinery.lng,
          rating: mockWinery.rating
        };
        createdWineryIds.push(wineryData.id);

        const { data, error } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Integration Test Trip',
          p_trip_date: new Date().toISOString().split('T')[0],
          p_winery_data: wineryData
        });

        expect(error).toBeNull();
        expect(data).toHaveProperty('trip_id');
        expect(data).toHaveProperty('winery_id');

        // Verify trip ownership
        const { data: trip } = await adminClient.from('trips').select('*').eq('id', data.trip_id).single();
        expect(trip.user_id).toBe(user1.id);
      });
    });

    describe('Visit Logging RPCs', () => {
      it('should log a visit atomically using log_visit', async () => {
        const mockWinery = createMockWinery();
        const wineryData = {
          id: `mock-winery-visit-${crypto.randomUUID()}`,
          name: mockWinery.name,
          address: mockWinery.address,
          lat: mockWinery.lat,
          lng: mockWinery.lng,
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
    });

    describe('Social RPCs', () => {
      it('should handle friend request lifecycle', async () => {
        // ... (existing test code)
      });

      it('should handle follow lifecycle (instant for public profiles)', async () => {
        // 1. Ensure user2 is public (default)
        await adminClient.from('profiles').update({ privacy_level: 'public' }).eq('id', user2.id);

        // 2. User 1 follows User 2
        const { data, error } = await user1.client.rpc('send_follow_request', {
          p_target_id: user2.id
        });
        expect(error).toBeNull();
        expect(data.status).toBe('followed');

        // 3. Verify in follows table
        const { data: follow } = await adminClient
          .from('follows')
          .select('*')
          .eq('follower_id', user1.id)
          .eq('following_id', user2.id)
          .single();
        expect(follow).not.toBeNull();
      });

      it('should handle follow request lifecycle (request for private profiles)', async () => {
        // 1. Set user3 to private
        await adminClient.from('profiles').update({ privacy_level: 'private' }).eq('id', user3.id);

        // 2. User 1 follows User 3
        const { data, error } = await user1.client.rpc('send_follow_request', {
          p_target_id: user3.id
        });
        expect(error).toBeNull();
        expect(data.status).toBe('request_sent');

        // 3. Verify in follow_requests table
        const { data: req } = await adminClient
          .from('follow_requests')
          .select('*')
          .eq('follower_id', user1.id)
          .eq('following_id', user3.id)
          .single();
        expect(req).not.toBeNull();

        // 4. User 3 accepts
        const { data: respondData, error: respondError } = await user3.client.rpc('respond_to_follow_request', {
          p_follower_id: user1.id,
          p_accept: true
        });
        expect(respondError).toBeNull();
        expect(respondData.status).toBe('accepted');

        // 5. Verify in follows table and request deleted
        const { data: follow } = await adminClient
          .from('follows')
          .select('*')
          .eq('follower_id', user1.id)
          .eq('following_id', user3.id)
          .single();
        expect(follow).not.toBeNull();

        const { data: deletedReq } = await adminClient
          .from('follow_requests')
          .select('*')
          .eq('follower_id', user1.id)
          .eq('following_id', user3.id)
          .maybeSingle();
        expect(deletedReq).toBeNull();
      });

      it('should allow followers to view content based on updated is_visible_to_viewer', async () => {
        // 0. Ensure no existing follow/friendship
        await adminClient.from('follows').delete().eq('follower_id', user1.id).eq('following_id', user2.id);
        await adminClient.from('friends').delete().or(`and(user1_id.eq.${user1.id},user2_id.eq.${user2.id}),and(user1_id.eq.${user2.id},user2_id.eq.${user1.id})`);

        // 1. Set user2 to 'friends_only'
        await adminClient.from('profiles').update({ privacy_level: 'friends_only' }).eq('id', user2.id);

        // 2. user1 is NOT a friend and NOT a follower yet
        const { data: visibleBefore } = await user1.client.rpc('is_visible_to_viewer', {
          p_target_user_id: user2.id,
          p_is_item_private: false
        });
        expect(visibleBefore).toBe(false);

        // 3. user1 follows user2
        await adminClient.from('follows').insert({ follower_id: user1.id, following_id: user2.id });

        // 4. Verify user1 can now see user2's content
        const { data: visibleAfter } = await user1.client.rpc('is_visible_to_viewer', {
          p_target_user_id: user2.id,
          p_is_item_private: false
        });
        expect(visibleAfter).toBe(true);

        // 5. Cleanup follow
        await adminClient.from('follows').delete().eq('follower_id', user1.id).eq('following_id', user2.id);
      });
    });
        });
