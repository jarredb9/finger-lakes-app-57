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

describe('Resilient Social Actions: Schema Verification', () => {
    it('should have the idempotency_key column in the visits table', async () => {
        const { error } = await adminClient
            .from('visits')
            .select('idempotency_key')
            .limit(1);
        
        expect(error).toBeNull();
    });

    it('should have the idempotency_key column in the trips table', async () => {
        const { error } = await adminClient
            .from('trips')
            .select('idempotency_key')
            .limit(1);
        
        expect(error).toBeNull();
    });
});
