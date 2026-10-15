
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Error: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function cleanup() {
  console.log('Starting cleanup of mock wineries...');

  // Delete wineries with IDs starting with "mock-winery-" (from RPC tests)
  const { data: rpcWineries, error: rpcError } = await supabase
    .from('wineries')
    .delete()
    .ilike('google_place_id', 'mock-winery-%')
    .select('id, google_place_id');

  if (rpcError) {
    console.error('Error deleting RPC mock wineries:', rpcError);
  } else {
    console.log(`Deleted ${rpcWineries?.length || 0} RPC mock wineries.`);
  }
  
  // Delete wineries with IDs starting with "ch-mock-winery-" (from E2E tests if leaked)
  const { data: e2eWineries, error: e2eError } = await supabase
    .from('wineries')
    .delete()
    .ilike('google_place_id', 'ch-mock-winery-%')
    .select('id, google_place_id');

  if (e2eError) {
      console.error('Error deleting E2E mock wineries:', e2eError);
  } else {
      console.log(`Deleted ${e2eWineries?.length || 0} E2E mock wineries.`);
  }

  // Delete test users (if any leaked)
  // Note: This is harder because we need to know the email pattern. 
  // RPC tests use "rpc-test-%", E2E uses "test-%"
  
  // CAUTION: Deleting users via listUsers is slow and pagination heavy. 
  // We'll stick to wineries for now as that was the user complaint.
  
  console.log('Cleanup complete.');
}

cleanup();
