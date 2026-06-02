import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 1. Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
// Use service role key if available, otherwise fall back to public anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY was found in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function enrichWineries() {
  console.log('🍇 Starting winery enrichment one-time script...');
  console.log(`🔗 Target Supabase URL: ${supabaseUrl}`);
  console.log(`🔑 Using key type: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Service Role Key' : 'Anon Key (Read-Only/Limit-Check)'}`);

  // 2. Query the wineries table to find all rows where enrichment_tier is 'basic' or IS NULL
  const { data: wineries, error } = await supabase
    .from('wineries')
    .select('google_place_id, name, enrichment_tier')
    .or('enrichment_tier.eq.basic,enrichment_tier.is.null');

  if (error) {
    console.error('❌ Error querying wineries:', error.message);
    process.exit(1);
  }

  if (!wineries || wineries.length === 0) {
    console.log('✅ No basic or un-enriched wineries found. Everything is already enriched!');
    return;
  }

  const total = wineries.length;
  console.log(`📋 Found ${total} wineries requiring enrichment.`);

  let enrichedCount = 0;
  let failedCount = 0;

  // 3. For each winery, invoke the local Edge Function get-winery-details
  for (let i = 0; i < total; i++) {
    const winery = wineries[i];
    console.log(`\n🔄 [${i + 1}/${total}] Enriching: "${winery.name}" (Place ID: ${winery.google_place_id})...`);

    try {
      // Invoke get-winery-details with body { placeId: google_place_id }
      const { error: invokeError } = await supabase.functions.invoke('get-winery-details', {
        body: { placeId: winery.google_place_id }
      });

      if (invokeError) {
        console.error(`❌ Failed to enrich "${winery.name}":`, invokeError);
        failedCount++;
      } else {
        enrichedCount++;
        console.log(`✅ Successfully enriched "${winery.name}"`);
      }
    } catch (err: any) {
      console.error(`💥 Fatal error calling function for "${winery.name}":`, err.message || err);
      failedCount++;
    }

    // Report progress
    console.log(`📊 Progress: Enriched ${enrichedCount} of ${total} wineries (${failedCount} failed)`);
  }

  console.log(`\n✨ Finished enrichment run. Total: ${total}, Succeeded: ${enrichedCount}, Failed: ${failedCount}.`);
}

enrichWineries().catch((err) => {
  console.error('💥 Script crashed:', err);
  process.exit(1);
});
