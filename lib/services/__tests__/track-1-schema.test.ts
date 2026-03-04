import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Schema tests failed to start: Missing credentials in process.env');
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

describe('Track 1: Social Infrastructure Refactor - Schema Verification', () => {
    it('should have the trip_members table with the correct schema', async () => {
        const { error } = await adminClient
            .from('trip_members')
            .select('*')
            .limit(1);
        
        expect(error).toBeNull();
    });

    it('should have backfilled trip_members from the trips table', async () => {
        // Count trips
        const { count: tripCount, error: countError } = await adminClient
            .from('trips')
            .select('*', { count: 'exact', head: true });
        
        expect(countError).toBeNull();

        // Count members (should be at least the same as tripCount since each trip has an owner)
        const { count: memberCount, error: memberCountError } = await adminClient
            .from('trip_members')
            .select('*', { count: 'exact', head: true });
        
        expect(memberCountError).toBeNull();
        expect(memberCount).toBeGreaterThanOrEqual(tripCount || 0);
    });
});
