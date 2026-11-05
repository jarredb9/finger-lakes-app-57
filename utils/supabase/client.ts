import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/lib/database.types"

export function createClient() {
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true')
          ? { 'x-skip-sw-interception': 'true' }
          : {}
      }
    }
  );

  // Expose to window for E2E testing
  if (typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_IS_E2E === 'true' || process.env.NODE_ENV !== 'production')) {
    (window as any).supabase = client;
    (window as any).createSupabaseClient = createClient;
  }

  return client;
}

if (typeof window !== 'undefined' && (process.env.NEXT_PUBLIC_IS_E2E === 'true' || process.env.NODE_ENV !== 'production')) {
  (window as any).createSupabaseClient = createClient;
}
