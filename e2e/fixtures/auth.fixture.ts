/* eslint-disable react-hooks/rules-of-hooks */
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { Page } from '@playwright/test';
import { Database } from '@/lib/database.types';
import { TestUser, Profile } from './types';

let adminClient: ReturnType<typeof createClient<Database>> | null = null;

export function getAdminClient(): ReturnType<typeof createClient<Database>> {
  if (adminClient) {
    return adminClient;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for test utils');
  }

  adminClient = createClient<Database>(url, serviceRoleKey);
  return adminClient;
}

export const supabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get(_target, prop) {
    return (getAdminClient() as any)[prop];
  }
});

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${uuidv4()}@example.com`;
  const password = `pass-${uuidv4()}`;
  const name = `User-${uuidv4().substring(0, 8)}`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new Error(`Failed: ${error?.message}`);
  await supabase.from('profiles').upsert({ id: data.user.id, email, name, privacy_level: 'public' });
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userId: string): Promise<void> {
  await supabase.auth.admin.deleteUser(userId);
}

export class AuthFixtureManager {
  private userProfilesState: Record<string, Partial<Profile>> = {};
  private currentUserId: string = 'test-user-id';

  constructor(private page: Page) {}

  setCurrentUserId(id: string) {
    this.currentUserId = id;
  }

  getCurrentUserId(): string {
    return this.currentUserId;
  }

  setUserProfile(userId: string, profile: Partial<Profile>) {
    this.userProfilesState[userId] = {
      ...(this.userProfilesState[userId] || {}),
      ...profile,
    };
  }

  getUserProfilesState(): Record<string, Partial<Profile>> {
    return this.userProfilesState;
  }

  async failLogin() {
    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400'
    };
    await this.page.context().route('**/auth/v1/token**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        headers: commonHeaders,
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
          message: 'Invalid login credentials',
          msg: 'Invalid login credentials'
        })
      });
    });
  }

  async registerMockRoutes(options: { currentUserId?: string; realSocialEnabled?: boolean } = {}) {
    if (options.currentUserId) {
      this.currentUserId = options.currentUserId;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    const supabaseUrlObj = new URL(supabaseUrl);
    const supabaseHost = supabaseUrlObj.host.replace(/\./g, '\\.');

    const commonHeaders = { 
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PATCH',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-total-count, x-skip-sw-interception',
      'Access-Control-Max-Age': '86400'
    };

    // Supabase Profiles REST Route Handler
    await this.page.context().route(new RegExp(`${supabaseHost}/rest/v1/profiles`), async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: commonHeaders });
      if (options.realSocialEnabled) return route.fallback();
      
      const idMatch = req.url().match(/id=eq\.([^&]+)/);
      const requestedId = idMatch ? idMatch[1] : this.currentUserId;
      
      if (req.method() === 'PATCH') {
        try {
          const postData = req.postDataJSON();
          if (postData) {
            this.userProfilesState[requestedId] = {
              ...(this.userProfilesState[requestedId] || {}),
              ...postData
            };
          }
        } catch (e) {}
        return route.fulfill({ status: 200, headers: commonHeaders, body: JSON.stringify([]) });
      }

      const baseProfile: Profile = { id: requestedId, name: 'Test User', email: 'test@example.com', privacy_level: 'public', ai_enabled: false };
      const profile: Profile = { ...baseProfile, ...(this.userProfilesState[requestedId] || {}) };
      const body = req.headers()['accept']?.includes('application/vnd.pgrst.object+json') 
        ? JSON.stringify(profile) 
        : JSON.stringify([profile]);
      
      return route.fulfill({ status: 200, contentType: 'application/json', headers: commonHeaders, body });
    });
  }
}

export const authFixture = async ({ page }: { page: Page }, use: (m: AuthFixtureManager) => Promise<void>) => {
  const manager = new AuthFixtureManager(page);
  await manager.registerMockRoutes();
  await use(manager);
};
