import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { createAdminClient } from '@/utils/supabase/admin';

jest.mock('@/utils/supabase/admin', () => ({
  createAdminClient: jest.fn(),
}));

describe('POST /api/auth/confirm-user (BE-01)', () => {
  const originalEnv = process.env;
  const mockUpdateUserById = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    (createAdminClient as jest.Mock).mockResolvedValue({
      auth: {
        admin: {
          updateUserById: mockUpdateUserById,
        },
      },
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Production environment guard', () => {
    it('returns 404 disabled endpoint in production mode', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.INTERNAL_API_SECRET = 'correct-secret';

      const request = new NextRequest('https://example.com/api/auth/confirm-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'correct-secret',
        },
        body: JSON.stringify({ email: 'target@example.com' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Endpoint disabled');
      expect(createAdminClient).not.toHaveBeenCalled();
    });
  });

  describe('Development / test environment secret validation', () => {
    beforeEach(() => {
      (process.env as any).NODE_ENV = 'development';
      process.env.INTERNAL_API_SECRET = 'test-secret-token';
    });

    it('rejects requests missing the x-internal-secret header with 401', async () => {
      const request = new NextRequest('https://example.com/api/auth/confirm-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'target@example.com' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toMatch(/unauthorized/i);
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it('rejects requests with invalid x-internal-secret header with 401', async () => {
      const request = new NextRequest('https://example.com/api/auth/confirm-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'wrong-secret-token',
        },
        body: JSON.stringify({ email: 'target@example.com' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toMatch(/unauthorized/i);
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it('processes user confirmation when x-internal-secret header matches', async () => {
      mockUpdateUserById.mockResolvedValue({ data: { user: { id: 'target-id' } }, error: null });

      const request = new NextRequest('https://example.com/api/auth/confirm-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'test-secret-token',
        },
        body: JSON.stringify({ email: 'target@example.com' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(createAdminClient).toHaveBeenCalled();
      expect(mockUpdateUserById).toHaveBeenCalledWith('target@example.com', {
        email_confirm: true,
      });
    });
  });

  describe('GET /api/auth/confirm-user', () => {
    it('returns 404 disabled endpoint in production mode', async () => {
      (process.env as any).NODE_ENV = 'production';
      process.env.INTERNAL_API_SECRET = 'correct-secret';

      const request = new NextRequest('https://example.com/api/auth/confirm-user', {
        method: 'GET',
        headers: {
          'x-internal-secret': 'correct-secret',
        },
      });

      const response = await GET(request);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Endpoint disabled');
    });

    it('rejects GET requests without valid secret in dev mode', async () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.INTERNAL_API_SECRET = 'test-secret-token';

      const request = new NextRequest('https://example.com/api/auth/confirm-user', {
        method: 'GET',
      });

      const response = await GET(request);
      expect(response.status).toBe(401);
    });

    it('returns 200 OK for GET requests with valid secret in dev mode', async () => {
      (process.env as any).NODE_ENV = 'development';
      process.env.INTERNAL_API_SECRET = 'test-secret-token';

      const request = new NextRequest('https://example.com/api/auth/confirm-user', {
        method: 'GET',
        headers: {
          'x-internal-secret': 'test-secret-token',
        },
      });

      const response = await GET(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('ok');
    });
  });
});
