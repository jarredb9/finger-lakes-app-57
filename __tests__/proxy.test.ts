import { NextRequest, NextResponse } from 'next/server';
import { proxy } from '@/proxy';
import { updateSession } from '@/utils/supabase/auth-helper';

jest.mock('@/utils/supabase/auth-helper', () => ({
  updateSession: jest.fn(),
}));

describe('proxy middleware', () => {
  const mockUpdateSession = updateSession as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Cookie preservation on redirects (BE-05)', () => {
    it('preserves Set-Cookie headers on redirects to /login for unauthenticated users', async () => {
      const mockResponse = NextResponse.next();
      mockResponse.cookies.set('sb-access-token', 'mock-access-token', {
        path: '/',
        httpOnly: true,
      });
      mockResponse.cookies.set('sb-refresh-token', 'mock-refresh-token', {
        path: '/',
        httpOnly: true,
      });

      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL('https://example.com/trips'));
      const result = await proxy(request);

      expect(result.status).toBe(307);
      expect(result.headers.get('location')).toBe('https://example.com/login?redirectTo=%2Ftrips');

      // Verify cookies set on updateSession response are preserved on redirect response
      const redirectCookies = result.cookies.getAll();
      const accessTokenCookie = redirectCookies.find(c => c.name === 'sb-access-token');
      const refreshTokenCookie = redirectCookies.find(c => c.name === 'sb-refresh-token');

      expect(accessTokenCookie).toBeDefined();
      expect(accessTokenCookie?.value).toBe('mock-access-token');
      expect(refreshTokenCookie).toBeDefined();
      expect(refreshTokenCookie?.value).toBe('mock-refresh-token');
    });
  });

  describe('Compliance routes whitelist (BE-11)', () => {
    it('allows unauthenticated access to /privacy without redirecting to /login', async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL('https://example.com/privacy'));
      const result = await proxy(request);

      expect(result.status).toBe(200);
      expect(result.headers.get('location')).toBeNull();
    });

    it('allows unauthenticated access to /terms without redirecting to /login', async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL('https://example.com/terms'));
      const result = await proxy(request);

      expect(result.status).toBe(200);
      expect(result.headers.get('location')).toBeNull();
    });
  });

  describe('Service Worker runtime chunk whitelist (FE-05)', () => {
    it('allows unauthenticated access to /workbox-*.js runtime chunks without redirecting', async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL('https://example.com/workbox-654321ab.js'));
      const result = await proxy(request);

      expect(result.status).toBe(200);
      expect(result.headers.get('location')).toBeNull();
    });

    it('allows unauthenticated access to /worker-*.js runtime chunks without redirecting', async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL('https://example.com/worker-abcdef12.js'));
      const result = await proxy(request);

      expect(result.status).toBe(200);
      expect(result.headers.get('location')).toBeNull();
    });
  });

  describe('Protected routes behavior', () => {
    it('redirects unauthenticated users on protected page routes to /login with redirectTo', async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL('https://example.com/settings'));
      const result = await proxy(request);

      expect(result.status).toBe(307);
      expect(result.headers.get('location')).toBe('https://example.com/login?redirectTo=%2Fsettings');
    });

    it('returns 401 JSON for unauthenticated requests to protected /api/ routes', async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL('https://example.com/api/trips'));
      const result = await proxy(request);

      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body).toEqual({ message: 'Unauthorized' });
    });

    it('allows authenticated users through on protected routes', async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: { id: 'user-123', email: 'test@example.com' },
      });

      const request = new NextRequest(new URL('https://example.com/trips'));
      const result = await proxy(request);

      expect(result.status).toBe(200);
      expect(result.headers.get('location')).toBeNull();
    });
  });
});
