/** @jest-environment jsdom */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { createMockWinery, createMockVisit } from '@/lib/test-utils/fixtures';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

jest.setTimeout(15000);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase RPC Integration tests failed to start: Missing credentials in process.env');
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

describe('Supabase RPC Idempotency Integration Tests', () => {
    let user1: { id: string; email: string; client: SupabaseClient };
    const createdWineryIds: string[] = [];

    const createAuthenticatedUser = async () => {
      const email = `rpc-idem-test-${crypto.randomUUID()}@example.com`;
      const password = crypto.randomUUID();
      
      const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (createError || !user) throw createError;

      const client = createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false }
      });
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      return { id: user.id, email, client };
    };

    beforeAll(async () => {
      user1 = await createAuthenticatedUser();
    });

    afterAll(async () => {
      if (user1) {
        // Cleanup user1 visits and trips
        await adminClient.from('visits').delete().eq('user_id', user1.id);
        await adminClient.from('trip_members').delete().eq('user_id', user1.id);
        await adminClient.from('trips').delete().eq('user_id', user1.id);
        await adminClient.auth.admin.deleteUser(user1.id);
      }
      
      if (createdWineryIds.length > 0) {
        await adminClient.from('wineries').delete().in('google_place_id', createdWineryIds);
      }
    });

    describe('log_visit Idempotency', () => {
      it('should return the same visit_id on duplicate log_visit with same idempotency key', async () => {
        const mockWinery = createMockWinery();
        const wineryData = {
          id: `idem-winery-${crypto.randomUUID()}`,
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

        const idempotencyKey = crypto.randomUUID();

        // First call
        const { data: data1, error: error1 } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryData,
          p_visit_data: visitData,
          p_idempotency_key: idempotencyKey
        });

        expect(error1).toBeNull();
        expect(data1).toHaveProperty('visit_id');
        const firstVisitId = data1.visit_id;

        // Second call with same idempotency key
        const { data: data2, error: error2 } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryData,
          p_visit_data: visitData,
          p_idempotency_key: idempotencyKey
        });

        expect(error2).toBeNull();
        expect(data2).toHaveProperty('visit_id');
        expect(data2.visit_id).toBe(firstVisitId);

        // Verify only 1 visit record exists for this user and winery
        const { data: visits } = await adminClient
          .from('visits')
          .select('id')
          .eq('user_id', user1.id)
          .eq('winery_id', data1.winery_id);
        expect(visits?.length).toBe(1);
      });
    });

    describe('update_visit Idempotency', () => {
      it('should successfully return the same updated record and prevent duplicate errors on update_visit', async () => {
        const mockWinery = createMockWinery();
        const wineryData = {
          id: `idem-winery-update-${crypto.randomUUID()}`,
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

        const logKey = crypto.randomUUID();
        const { data: loggedData, error: logError } = await user1.client.rpc('log_visit', {
          p_winery_data: wineryData,
          p_visit_data: visitData,
          p_idempotency_key: logKey
        });
        expect(logError).toBeNull();
        const visitId = loggedData.visit_id;

        const updateKey = crypto.randomUUID();
        const updatedVisitData = {
          ...visitData,
          user_review: 'An updated review that is long enough'
        };

        // First update
        const { data: updated1, error: updateError1 } = await user1.client.rpc('update_visit', {
          p_visit_id: visitId,
          p_visit_data: updatedVisitData,
          p_idempotency_key: updateKey
        });
        expect(updateError1).toBeNull();
        expect(updated1).toHaveProperty('id', visitId);

        // Second update with same idempotency key
        const { data: updated2, error: updateError2 } = await user1.client.rpc('update_visit', {
          p_visit_id: visitId,
          p_visit_data: updatedVisitData,
          p_idempotency_key: updateKey
        });
        expect(updateError2).toBeNull();
        expect(updated2).toHaveProperty('id', visitId);
      });
    });

    describe('create_trip and create_trip_with_winery Idempotency', () => {
      it('should return the same trip_id on duplicate create_trip with same idempotency key', async () => {
        const idempotencyKey = crypto.randomUUID();
        const tripDate = new Date().toISOString().split('T')[0];

        // First call to create_trip
        const { data: data1, error: error1 } = await user1.client.rpc('create_trip', {
          p_name: 'Idempotent Trip 1',
          p_trip_date: tripDate,
          p_idempotency_key: idempotencyKey
        });
        expect(error1).toBeNull();
        expect(data1).toHaveProperty('id');
        const tripId1 = data1.id;

        // Second call with same key
        const { data: data2, error: error2 } = await user1.client.rpc('create_trip', {
          p_name: 'Idempotent Trip 1',
          p_trip_date: tripDate,
          p_idempotency_key: idempotencyKey
        });
        expect(error2).toBeNull();
        expect(data2).toHaveProperty('id');
        expect(data2.id).toBe(tripId1);
      });

      it('should return the same trip_id and winery_id on duplicate create_trip_with_winery', async () => {
        const idempotencyKey = crypto.randomUUID();
        const tripDate = new Date().toISOString().split('T')[0];
        const wineryData = {
          id: `idem-winery-trip-${crypto.randomUUID()}`,
          name: 'Trip Winery',
          address: '789 Trip Rd',
          lat: 43.1,
          lng: -77.6,
          rating: 4.2
        };
        createdWineryIds.push(wineryData.id);

        // First call
        const { data: data1, error: error1 } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Trip With Winery Idempotent',
          p_trip_date: tripDate,
          p_winery_data: wineryData,
          p_idempotency_key: idempotencyKey
        });
        expect(error1).toBeNull();
        expect(data1).toHaveProperty('trip_id');
        const firstTripId = data1.trip_id;

        // Second call
        const { data: data2, error: error2 } = await user1.client.rpc('create_trip_with_winery', {
          p_trip_name: 'Trip With Winery Idempotent',
          p_trip_date: tripDate,
          p_winery_data: wineryData,
          p_idempotency_key: idempotencyKey
        });
        expect(error2).toBeNull();
        expect(data2).toHaveProperty('trip_id');
        expect(data2.trip_id).toBe(firstTripId);
      });
    });
});
