import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/confirm-user', '/manifest.webmanifest', '/sw.js'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log(`[Middleware] Path: ${pathname}`);

  // Handle session update for all routes
  const { response, user } = await updateSession(request);

  const isPublic = publicRoutes.includes(pathname);
  console.log(`[Middleware] Is Public: ${isPublic}, User Found: ${!!user}`);

  // Skip auth check for public routes
  if (isPublic) {
    console.log(`[Middleware] Allowing public route: ${pathname}`);
    return response;
  }

  // Check for user on protected routes
  if (!user) {
    console.log(`[Middleware] No user found, blocking protected route: ${pathname}`);
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Redirect to login if no user and not a public route
    console.log(`[Middleware] Redirecting to /login`);
    return NextResponse.redirect(new URL('/login', request.url));
  }

  console.log(`[Middleware] User found, allowing protected route: ${pathname}`);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - any path containing a dot (e.g., .js, .css, .png, .ico)
     */
    '/((?!api|_next/static|_next/image|.*\\..*).*)',
  ],
};
