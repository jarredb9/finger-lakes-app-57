/**
 * Checks if a URL is a Supabase URL, handling production and local development.
 * Normalizes localhost and 127.0.0.1 for local development interception.
 */
export const isSupabaseUrl = (
  url: URL,
  supabaseUrl: string,
  baseUrl: string,
  selfLocationOrigin?: string
): boolean => {
  const host = url.hostname;

  // 1. Explicitly exclude the app's own origin to prevent intercepting pages
  if (selfLocationOrigin && url.origin === selfLocationOrigin) {
    return false;
  }

  // Fallback to configured BASE_URL
  if (baseUrl && url.href.startsWith(baseUrl)) {
    return false;
  }

  // 2. Check if it's the production Supabase domain
  if (host.endsWith('.supabase.co') || host === 'supabase.co') {
    return true;
  }

  // 3. Check if it starts with the configured Supabase URL (handles local dev)
  if (supabaseUrl) {
    // Normalization logic: Treat localhost and 127.0.0.1 as equivalent for local dev
    const normalizedUrl = url.href.replace('://localhost', '://127.0.0.1');
    const normalizedSupabaseUrl = supabaseUrl.replace('://localhost', '://127.0.0.1');
    
    if (normalizedUrl.startsWith(normalizedSupabaseUrl)) {
      return true;
    }
  }

  return false;
};

/**
 * Checks if a URL is an Auth API route for Supabase.
 */
export const isAuthApiRoute = (
  url: URL,
  supabaseUrl?: string,
  baseUrl?: string,
  selfLocationOrigin?: string
): boolean => {
  if (!isSupabaseUrl(url, supabaseUrl || '', baseUrl || '', selfLocationOrigin)) {
    return false;
  }
  return url.pathname.includes('/auth/v1/');
};

/**
 * Checks if a pathname or URL is an authentication page that should be excluded
 * from Serwist's pages document cache.
 */
export const isAuthPageRoute = (urlOrPath: URL | string): boolean => {
  const pathname = typeof urlOrPath === 'string'
    ? urlOrPath.split('?')[0]
    : urlOrPath.pathname;

  const authPrefixes = ['/login', '/signup', '/forgot-password', '/reset-password', '/manual-confirm'];
  return authPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};
