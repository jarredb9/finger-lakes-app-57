import { getUser } from '../auth';

// Mock the Supabase client generator
jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(),
}));

import { createClient } from '@/utils/supabase/server';

describe('getUser', () => {
  const mockGetUser = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockResolvedValue({
      auth: {
        getUser: mockGetUser,
      },
    });
  });

  it('should return user data when authenticated with metadata', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: '123',
          email: 'test@example.com',
          user_metadata: { name: 'Test User' },
        },
      },
      error: null,
    });

    const user = await getUser();
    
    expect(user).toEqual({
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
    });
  });

  it('should fallback to name from email if metadata is missing', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: '456',
          email: 'fallback@example.com',
          user_metadata: {},
        },
      },
      error: null,
    });

    const user = await getUser();
    
    expect(user).toEqual({
      id: '456',
      email: 'fallback@example.com',
      name: 'fallback', // Split from email
    });
  });

  it('should fallback to "User" if email is also missing (edge case)', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: '789',
          email: null,
          user_metadata: {},
        },
      },
      error: null,
    });

    const user = await getUser();
    
    expect(user).toEqual({
      id: '789',
      email: '',
      name: 'User',
    });
  });

  it('should return null if auth error occurs', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not logged in' },
    });

    const user = await getUser();
    
    expect(user).toBeNull();
  });

  it('should return null if exception is thrown', async () => {
    mockGetUser.mockRejectedValue(new Error('Supabase is down'));

    const user = await getUser();
    
    expect(user).toBeNull();
  });
});
