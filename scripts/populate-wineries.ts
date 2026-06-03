import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Finger Lakes Regions to populate
const REGIONS = [
  {
    name: "Seneca Lake (North)",
    bounds: { north: 42.9, south: 42.7, east: -76.8, west: -77.0 }
  },
  {
    name: "Seneca Lake (South)",
    bounds: { north: 42.6, south: 42.4, east: -76.8, west: -77.0 }
  },
  {
    name: "Keuka Lake",
    bounds: { north: 42.6, south: 42.4, east: -77.1, west: -77.3 }
  },
  {
    name: "Cayuga Lake",
    bounds: { north: 42.9, south: 42.7, east: -76.6, west: -76.8 }
  }
];

async function populate() {
  console.log('🍷 Starting winery population for local database...');
  console.log(`🔗 Targeting: ${supabaseUrl}`);

  for (const region of REGIONS) {
    console.log(`🔍 Searching ${region.name}...`);
    
    try {
      const { data, error } = await supabase.functions.invoke('search-wineries', {
        body: {
          query: 'winery',
          locationRestriction: region.bounds,
          useEnrichment: true
        }
      });

      if (error) {
        console.error(`❌ Error searching ${region.name}:`, error.message);
        if (error.message.includes('Missing GOOGLE_MAPS_API_KEY')) {
          console.log('\n💡 TIP: You need to set the API key for local functions:');
          console.log('npx supabase secrets set GOOGLE_MAPS_API_KEY=your_key_here --local\n');
          process.exit(1);
        }
        continue;
      }

      if (!Array.isArray(data) || data.length === 0) {
        console.log(`⚠️  No results found for ${region.name}. Check your local Supabase logs for detail.`);
      }

      const count = Array.isArray(data) ? data.length : 0;
      console.log(`✅ Found and persisted ${count} wineries in ${region.name}.`);
    } catch (err: any) {
      console.error(`💥 Fatal error for ${region.name}:`, err.message);
    }
  }

  console.log('\n✨ Population complete! Run "npm run dev" to see the wineries on your map.');
}

populate();
