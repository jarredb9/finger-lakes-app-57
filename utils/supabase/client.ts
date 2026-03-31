import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_E2E === 'true')
          ? { 'x-skip-sw-interception': 'true' }
          : {}
      }
    }
  )
}
