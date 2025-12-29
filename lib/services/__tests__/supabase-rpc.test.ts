import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars immediately at the top of the file
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

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
    });

    afterAll(async () => {
      if (user1) await adminClient.auth.admin.deleteUser(user1.id);
      if (user2) await adminClient.auth.admin.deleteUser(user2.id);
    });

    describe('Trip Management RPCs', () => {
      it('should create a trip with a winery atomically using create_trip_with_winery', async () => {
        const wineryData = {
          id: `mock-winery-${crypto.randomUUID()}`,
          name: 'RPC Test Winery',
          address: '123 SQL Lane',
          lat: 42.5,
          lng: -76.5,
          rating: 4.5
        };

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
        const wineryData = {
          id: `mock-winery-visit-${crypto.randomUUID()}`,
          name: 'Visit Test Winery',
          address: '456 Review St',
          lat: 42.6,
          lng: -76.6,
          rating: 4.0
        };

        const visitData = {
          visit_date: new Date().toISOString().split('T')[0],
          rating: 5,
          user_review: 'Excellent RPC!'
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
        expect(visit.rating).toBe(5);
      });
    });

    describe('Social RPCs', () => {
      it('should handle friend request lifecycle', async () => {
        // 1. User 1 sends request to User 2
        const { error: sendError } = await user1.client.rpc('send_friend_request', {
          target_email: user2.email
        });
        expect(sendError).toBeNull();

        // 2. Verify Pending Request (as admin)
        const { data: req } = await adminClient
          .from('friends')
          .select('*')
          .eq('user1_id', user1.id)
          .eq('user2_id', user2.id)
          .single();
        expect(req.status).toBe('pending');

        // 3. User 2 responds (Accept)
        const { error: respondError } = await user2.client.rpc('respond_to_friend_request', {
          requester_id: user1.id,
          accept: true
        });
        expect(respondError).toBeNull();

        // 4. Verify Accepted
        const { data: friendship } = await adminClient
          .from('friends')
          .select('status')
          .eq('user1_id', user1.id)
          .eq('user2_id', user2.id)
          .single();
              expect(friendship).not.toBeNull();
              expect(friendship?.status).toBe('accepted');
            });
          });
        });
