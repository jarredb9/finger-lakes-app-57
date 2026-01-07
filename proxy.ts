import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

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
    // Redirect to login if no user and not a public route
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - any path containing a dot (e.g., .js, .css, .png, .ico)
     * 
     * Note: We now INCLUDE /api/ routes so the auth check in the proxy function runs.
     */
    '/((?!_next/static|_next/image|.*\\..*).*)',
  ],
};
