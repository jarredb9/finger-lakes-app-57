import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  const client = createBrowserClient(
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
  }

  return client;
}
