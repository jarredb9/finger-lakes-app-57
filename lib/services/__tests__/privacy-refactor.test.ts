import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { createMockWinery } from '@/lib/test-utils/fixtures';

// Load env vars
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Privacy Refactor tests failed to start: Missing credentials in process.env');
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

describe('Privacy Refactor Integration Tests', () => {
    let publicUser: { id: string; email: string; client: SupabaseClient };
    let privateUser: { id: string; email: string; client: SupabaseClient };
    let friendsOnlyUser: { id: string; email: string; client: SupabaseClient };
    let viewerUser: { id: string; email: string; client: SupabaseClient };
    let friendUser: { id: string; email: string; client: SupabaseClient };
    let wineryId: number;

    const createAuthenticatedUser = async () => {
      const email = `privacy-test-${crypto.randomUUID()}@example.com`;
      const password = crypto.randomUUID();
      
      const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (createError || !user) throw createError;

      const client = createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false }
      });
      const { error: signInError } = await client.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      return { id: user.id, email, client };
    };

    beforeAll(async () => {
      publicUser = await createAuthenticatedUser();
      privateUser = await createAuthenticatedUser();
      friendsOnlyUser = await createAuthenticatedUser();
      viewerUser = await createAuthenticatedUser();
      friendUser = await createAuthenticatedUser();

      // Set privacy levels via admin (since RPCs might not exist yet or work)
      await adminClient.from('profiles').update({ privacy_level: 'public' }).eq('id', publicUser.id);
      await adminClient.from('profiles').update({ privacy_level: 'private' }).eq('id', privateUser.id);
      await adminClient.from('profiles').update({ privacy_level: 'friends_only' }).eq('id', friendsOnlyUser.id);

      // Setup friendship between friendsOnlyUser and friendUser
      await adminClient.from('friends').insert({
        user1_id: friendsOnlyUser.id,
        user2_id: friendUser.id,
        status: 'accepted'
      });

      // Create a winery to favorite
      const mockWinery = createMockWinery();
      const { data: winery } = await adminClient.from('wineries').insert({
        google_place_id: `privacy-test-winery-${crypto.randomUUID()}`,
        name: mockWinery.name,
        address: mockWinery.address,
        latitude: mockWinery.lat,
        longitude: mockWinery.lng
      }).select().single();
      wineryId = winery.id;

      // Each user favorites the winery
      await adminClient.from('favorites').insert([
        { user_id: publicUser.id, winery_id: wineryId },
        { user_id: privateUser.id, winery_id: wineryId },
        { user_id: friendsOnlyUser.id, winery_id: wineryId }
      ]);
    });

    afterAll(async () => {
      const users = [publicUser, privateUser, friendsOnlyUser, viewerUser, friendUser];
      for (const u of users) {
        if (u) await adminClient.auth.admin.deleteUser(u.id);
      }
      if (wineryId) {
        await adminClient.from('wineries').delete().eq('id', wineryId);
      }
    });

    describe('Favorites Privacy RLS', () => {
      it('Viewer should see Public users favorite', async () => {
        const { data, error } = await viewerUser.client
          .from('favorites')
          .select('*')
          .eq('user_id', publicUser.id);
        
        expect(error).toBeNull();
        expect(data?.length).toBe(1);
      });

      it('Viewer should NOT see Private users favorite', async () => {
        const { data } = await viewerUser.client
          .from('favorites')
          .select('*')
          .eq('user_id', privateUser.id);
        
        expect(data?.length).toBe(0);
      });

      it('Viewer should NOT see Friends Only users favorite (if not friend)', async () => {
        const { data } = await viewerUser.client
          .from('favorites')
          .select('*')
          .eq('user_id', friendsOnlyUser.id);
        
        expect(data?.length).toBe(0);
      });

      it('Friend SHOULD see Friends Only users favorite', async () => {
        const { data } = await friendUser.client
          .from('favorites')
          .select('*')
          .eq('user_id', friendsOnlyUser.id);
        
        expect(data?.length).toBe(1);
      });
    });
});
