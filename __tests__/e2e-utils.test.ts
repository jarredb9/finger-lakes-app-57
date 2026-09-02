/** @jest-environment node */
jest.mock('uuid', () => ({
  v4: () => 'mock-uuid-v4',
}));
jest.mock('@playwright/test', () => ({
  test: { extend: jest.fn(() => ({})) },
}));

describe('e2e/utils environment independence (QA-11)', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  it('can be imported without throwing when Supabase env vars are unset', () => {
    expect(() => {
      require('@/e2e/utils');
    }).not.toThrow();
  });

  it('throws descriptive error only when getAdminClient is invoked without credentials', () => {
    const { getAdminClient } = require('@/e2e/utils');
    expect(() => getAdminClient()).toThrow(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for test utils'
    );
  });
});
