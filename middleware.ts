import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { createClient } from '@/utils/supabase/server';

const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback', '/api/auth/forgot-password', '/api/auth/reset-password'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle session update for all routes
  const response = await updateSession(request);

  // Skip auth check for public routes
  if (publicRoutes.includes(pathname)) {
    return response;
  }

  // Check for user on protected routes
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
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
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};