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
        // This test will fail if the table doesn't exist
        const { error } = await adminClient
            .from('trip_members')
            .select('*')
            .limit(1);
        
        // We expect an error initially (404 or similar) because the table doesn't exist yet
        expect(error).toBeNull();
    });
});
