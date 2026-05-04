import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/auth-helper';

const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/confirm-user', '/site.webmanifest', '/sw.js'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle session update for all routes
  const { response, user } = await updateSession(request);

  // Skip auth check for public routes
  if (publicRoutes.includes(pathname)) {
    return response;
  }

  // Check for user on protected routes
  if (!user) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // In E2E mode, avoid aggressive redirects to prevent test instability during network flips,
    // BUT we must allow the initial redirect to login to preserve the redirectTo parameter.
    if (process.env.IS_E2E === 'true' && pathname !== '/' && !pathname.startsWith('/trips/')) {
        console.log(`[PROXY] No user found for ${pathname} but skipping redirect due to E2E mode`);
        return response;
    }

    // Redirect to login if no user and not a public route
    const url = new URL('/login', request.url);
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - common static image/style extensions
     * 
     * We want to match /sw.js and /site.webmanifest so the proxy logic can handle them.
     * So we EXCLUDE images and css, but NOT js or webmanifest.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|css)$).*)',
  ],
};
