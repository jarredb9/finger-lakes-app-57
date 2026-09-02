/** @jest-environment node */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { execSync } from 'child_process';

const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

jest.setTimeout(25000);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('Database Optimization Integration tests failed to start: Missing credentials in process.env');
}

const adminClient = createClient(supabaseUrl, serviceRoleKey);

function runSql(sql: string): string {
  try {
    return execSync(
      `podman exec -i supabase_db_finger-lakes-app-57 psql -U postgres -d postgres -t -A -c "${sql.replace(/"/g, '\\"')}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
  } catch (err: any) {
    throw new Error(`psql command failed: ${err.stderr || err.message}`);
  }
}

describe('Phase 1: Relational Indexes, Query Inlining & Idempotent Migrations', () => {
  let user1: { id: string; email: string; client: SupabaseClient };
  let user2: { id: string; email: string; client: SupabaseClient };
  let testWineryId: number;
  const testPlaceId = `test-db-opt-${Date.now()}`;

  const createAuthenticatedUser = async () => {
    const email = `db-opt-${crypto.randomUUID()}@example.com`;
    const password = crypto.randomUUID();

    const { data: { user }, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !user) throw createError;

    const client = createClient(supabaseUrl!, anonKey!, {
      auth: { persistSession: false },
    });
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    return { id: user.id, email, client };
  };

  beforeAll(async () => {
    user1 = await createAuthenticatedUser();
    user2 = await createAuthenticatedUser();

    // Create a temporary winery for tests
    const { data: winery, error: wineryError } = await adminClient
      .from('wineries')
      .insert({
        name: 'DB Optimization Test Winery',
        address: '123 Test St, Geneva, NY 14456',
        google_place_id: testPlaceId,
        latitude: 42.8864,
        longitude: -76.9897,
      })
      .select('id')
      .single();

    if (wineryError || !winery) throw wineryError;
    testWineryId = winery.id;
  });

  afterAll(async () => {
    if (user1) await adminClient.auth.admin.deleteUser(user1.id);
    if (user2) await adminClient.auth.admin.deleteUser(user2.id);
    if (testWineryId) {
      await adminClient.from('wineries').delete().eq('id', testWineryId);
    }
  });

  describe('Relational & Covering Indexes (BE-06, BE-08)', () => {
    const requiredIndexes = [
      { table: 'visits', name: 'idx_visits_user_id' },
      { table: 'visits', name: 'idx_visits_winery_id' },
      { table: 'visits', name: 'idx_visits_winery_user' },
      { table: 'trip_wineries', name: 'idx_trip_wineries_winery_id' },
      { table: 'trip_members', name: 'idx_trip_members_user_id' },
      { table: 'follows', name: 'idx_follows_following_id' },
      { table: 'wineries', name: 'idx_wineries_name' },
      { table: 'activity_ledger', name: 'idx_activity_ledger_type_object' },
    ];

    it.each(requiredIndexes)(
      'should have index $name on table $table',
      ({ table, name }) => {
        const raw = runSql(
          `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = '${table}' AND indexname = '${name}';`
        );
        expect(raw).toBe(name);
      }
    );
  });

  describe('get_map_markers Query Plan & Inlining (BE-07)', () => {
    it('should use hash joins and avoid per-row correlated scalar subqueries in get_map_markers', () => {
      const prosrc = runSql(
        `SELECT prosrc FROM pg_proc WHERE proname = 'get_map_markers' AND pronamespace = 'public'::regnamespace;`
      );
      // Ensure the old per-row scalar subqueries are gone
      expect(prosrc).not.toContain('EXISTS (SELECT 1 FROM public.favorites f WHERE f.winery_id = w.id AND f.user_id = p_user_id)');
      expect(prosrc).not.toContain('COALESCE((SELECT f.is_private FROM public.favorites');
      // Ensure set-based LEFT JOINs are used
      expect(prosrc).toContain('LEFT JOIN');
    });

    it('should configure search_path = public, pg_temp to prevent schema spoofing', () => {
      const proconfig = runSql(
        `SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname = 'get_map_markers' AND pronamespace = 'public'::regnamespace;`
      );
      expect(proconfig).toContain('search_path=public, pg_temp');
    });

    it('should execute get_map_markers accurately for an authenticated user', async () => {
      // Add favorite and visit for user1
      await adminClient.from('favorites').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        is_private: false,
      });
      await adminClient.from('visits').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        visit_date: '2026-09-02',
        is_private: false,
      });

      const { data, error } = await user1.client.rpc('get_map_markers', {
        p_user_id: user1.id,
      });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      const testMarker = data.find((m: any) => m.id === testWineryId);
      expect(testMarker).toBeDefined();
      expect(testMarker.is_favorite).toBe(true);
      expect(testMarker.user_visited).toBe(true);
      expect(testMarker.on_wishlist).toBe(false);
    });
  });

  describe('is_visible_to_viewer Inlining & RLS (BE-09)', () => {
    it('should define is_visible_to_viewer as LANGUAGE sql STABLE for optimizer inlining', () => {
      const meta = runSql(
        `SELECT l.lanname, p.provolatile FROM pg_proc p JOIN pg_language l ON p.prolang = l.oid WHERE p.proname = 'is_visible_to_viewer' AND p.pronamespace = 'public'::regnamespace;`
      );
      const [lang, volatile] = meta.split('|');
      expect(lang).toBe('sql');
      expect(volatile).toBe('s'); // 's' for STABLE
    });

    it('should enforce RLS correctly: allow public visits and hide private visits from other users', async () => {
      // 1. user1 adds a public visit
      const { data: pubVisit, error: pubError } = await adminClient.from('visits').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        visit_date: '2026-09-01',
        is_private: false,
      }).select().single();
      expect(pubError).toBeNull();

      // 2. user1 adds a private visit
      const { data: privVisit, error: privError } = await adminClient.from('visits').insert({
        user_id: user1.id,
        winery_id: testWineryId,
        visit_date: '2026-09-02',
        is_private: true,
      }).select().single();
      expect(privError).toBeNull();

      // 3. user2 queries visits
      const { data: viewerVisits, error: viewerError } = await user2.client
        .from('visits')
        .select('id, user_id, is_private')
        .in('id', [pubVisit.id, privVisit.id]);

      expect(viewerError).toBeNull();
      const visibleIds = (viewerVisits || []).map((v: any) => v.id);
      expect(visibleIds).toContain(pubVisit.id);
      expect(visibleIds).not.toContain(privVisit.id);

      // 4. user1 queries visits (sees both)
      const { data: ownerVisits, error: ownerError } = await user1.client
        .from('visits')
        .select('id')
        .in('id', [pubVisit.id, privVisit.id]);

      expect(ownerError).toBeNull();
      const ownerIds = (ownerVisits || []).map((v: any) => v.id);
      expect(ownerIds).toContain(pubVisit.id);
      expect(ownerIds).toContain(privVisit.id);
    });
  });

  describe('Phase 3: Webhook Parameterization & Edge Function Cleanup (BE-12, BE-13)', () => {
    it('handle_activity_ledger_notification should not contain hardcoded production URL or secrets', () => {
      const src = runSql(
        `SELECT prosrc FROM pg_proc WHERE proname = 'handle_activity_ledger_notification' AND pronamespace = 'public'::regnamespace;`
      );
      expect(src).not.toContain('jfsxclrdxmvftxacjuqf');
      expect(src).toContain('app.settings.supabase_url');
    });

    it('handle_visits_gemini_summary trigger and function should be dropped', () => {
      const funcCount = runSql(
        `SELECT count(*) FROM pg_proc WHERE proname = 'handle_visits_gemini_summary' AND pronamespace = 'public'::regnamespace;`
      );
      expect(funcCount).toBe('0');

      const trigCount = runSql(
        `SELECT count(*) FROM pg_trigger WHERE tgname = 'tr_visits_gemini_summary';`
      );
      expect(trigCount).toBe('0');
    });

    it('orphaned Edge Function update-gemini-summary directory should be removed', () => {
      const fs = require('fs');
      const dirPath = path.resolve(process.cwd(), 'supabase/functions/update-gemini-summary');
      expect(fs.existsSync(dirPath)).toBe(false);
    });
  });
});
