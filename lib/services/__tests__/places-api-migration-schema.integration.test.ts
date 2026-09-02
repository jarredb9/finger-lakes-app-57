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

describe('Places API Migration: Enriched Winery Attributes Schema Verification', () => {
    it('should have all enrichment and sync-lock columns in the wineries table', async () => {
        // This will fail if the table is empty and we can't get keys.
        // A better way is to try to select each column individually.
        const expectedColumns = [
            'enrichment_tier',
            'last_enriched_at',
            'generative_summary',
            'neighborhood_summary',
            'editorial_summary',
            'primary_photo_reference',
            'photo_references',
            'allows_dogs',
            'good_for_children',
            'outdoor_seating',
            'has_ev_charging',
            'serves_wine',
            'parking_options',
            'accessibility_flags',
            'last_action_timestamp',
            'revision_id'
        ];

        // This will fail if the table is empty and we can't get keys.
        // A better way is to try to select each column individually.
        for (const col of expectedColumns) {
            const { error: colError } = await adminClient
                .from('wineries')
                .select(col)
                .limit(1);
            
            if (colError) {
                console.error(`Column missing: ${col}`, colError);
            }
            expect(colError).toBeNull();
        }
    });
});
