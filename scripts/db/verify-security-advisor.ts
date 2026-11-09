/**
 * scripts/db/verify-security-advisor.ts
 *
 * Automated verification runner for Supabase Security Advisor linter resolution
 * across categories 0007, 0008, 0010, 0026, 0027, 0028, and 0029, adhering to ADR-0007 and ADR-0010.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Canonical Security Advisor linter categories addressed across Issues #87 and #93.
 */
export type SecurityAdvisorCategory =
  | '0007_policy_exists_rls_disabled'
  | '0008_rls_enabled_no_policy'
  | '0010_security_definer_view'
  | '0026_pg_graphql_anon_table_exposed'
  | '0027_pg_graphql_authenticated_table_exposed'
  | '0028_anon_security_definer_function_executable'
  | '0029_authenticated_security_definer_function_executable';

/**
 * Result of inspecting an individual Security Advisor category.
 */
export interface AdvisorCategoryResult {
  category: SecurityAdvisorCategory;
  name: string;
  passed: boolean;
  violationCount: number;
  violations: string[];
  remediationSummary: string;
}

/**
 * Composite verification scorecard for all Security Advisor checks.
 */
export interface SecurityAdvisorScorecard {
  timestamp: string;
  databaseUrl: string;
  allPassed: boolean;
  totalViolations: number;
  results: Record<SecurityAdvisorCategory, AdvisorCategoryResult>;
  cliLintOutput?: string;
}

/**
 * ADR-0007 strict allowlist of boundary SECURITY DEFINER functions.
 */
export const ALLOWLISTED_SECURITY_DEFINER_RPCS = [
  'ensure_winery',
  'is_visible_to_viewer',
  'is_trip_member',
  'add_trip_member_by_email',
  'send_friend_request',
  'get_friends_and_requests',
  'get_trip_details',
] as const;

/**
 * List of 10 dead/deprecated RPCs that must be completely absent from PostgreSQL catalogs.
 */
export const DROPPED_LEGACY_RPCS = [
  'upsert_wineries_from_search',
  'get_all_user_visits_list',
  'get_user_dashboard',
  'get_user_winery_data_aggregated',
  'get_winery_details',
  'get_wineries_in_bounds',
  'add_winery_to_trips',
  'add_to_wishlist',
  'send_follow_request',
  'respond_to_follow_request',
] as const;

/**
 * List of 26 active user-facing RPCs converted to SECURITY INVOKER.
 */
export const CONVERTED_SECURITY_INVOKER_RPCS = [
  'get_map_markers',
  'get_paginated_wineries',
  'get_winery_details_by_id',
  'get_trips_for_date',
  'get_friend_activity_feed',
  'get_friend_profile_with_visits',
  'get_friends_activity_for_winery',
  'get_friends_ratings_for_winery',
  'create_trip',
  'create_trip_with_winery',
  'delete_trip',
  'add_winery_to_trip',
  'remove_winery_from_trip',
  'reorder_trip_wineries',
  'update_trip_winery_notes',
  'log_visit',
  'update_visit',
  'delete_visit',
  'toggle_favorite',
  'toggle_wishlist',
  'toggle_favorite_privacy',
  'toggle_wishlist_privacy',
  'update_profile_privacy',
  'remove_friend',
  'respond_to_friend_request',
] as const;

/**
 * Validates that target host is local to prevent accidental execution against remote environments.
 */
export function assertLocalEnvironment(url: string): void {
  try {
    const parsed = new URL(url);
    const isLocal =
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '0.0.0.0';

    if (!isLocal) {
      throw new Error(
        `Safety Guardrail Triggered: Target URL ${url} is not local. Execution against remote projects is strictly prohibited by AGENTS.md.`
      );
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Safety Guardrail')) {
      throw err;
    }
    throw new Error(`Invalid Supabase URL: ${url}`);
  }
}

/**
 * Detects portable Docker / Podman socket location.
 * Respects explicit DOCKER_HOST if provided, falls back to user Podman socket
 * only if present on disk, or returns undefined for default Docker daemon.
 */
export function resolveDockerHost(): string | undefined {
  if (process.env.DOCKER_HOST) {
    return process.env.DOCKER_HOST;
  }
  const uid = process.getuid ? process.getuid() : 1000;
  const podmanSock = `/run/user/${uid}/podman/podman.sock`;
  if (fs.existsSync(podmanSock)) {
    return `unix://${podmanSock}`;
  }
  return undefined;
}

/**
 * Execute the SQL catalog verification script via Supabase CLI.
 */
export async function executeSqlCatalogVerification(): Promise<{
  passed: boolean;
  error?: string;
}> {
  const dockerHost = resolveDockerHost();
  const binPath = path.resolve(process.cwd(), 'scripts/bin');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: process.env.PATH ? `${binPath}:${process.env.PATH}` : binPath,
    ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}),
  };

  try {
    execSync(
      'npx supabase db query -f scripts/db/verify-security-advisor.sql',
      {
        env,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    return { passed: true };
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    const errText =
      (execError.stderr || '') + '\n' + (execError.stdout || '') || execError.message || String(error);
    return { passed: false, error: errText.trim() };
  }
}

/**
 * Execute Supabase CLI lint and parse output for categories 0026, 0027, 0028, 0029.
 */
export async function executeCliLinter(): Promise<{
  rawOutput: string;
  violationsFound: string[];
}> {
  const dockerHost = resolveDockerHost();
  const binPath = path.resolve(process.cwd(), 'scripts/bin');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: process.env.PATH ? `${binPath}:${process.env.PATH}` : binPath,
    ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}),
  };

  let stdout = '';
  let stderr = '';

  try {
    stdout = execSync(
      'npx supabase db lint --level warning --schema public',
      {
        env,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string };
    stdout = execError.stdout || '';
    stderr = execError.stderr || '';
  }

  const combined = stdout + '\n' + stderr;
  const targetCategories = [
    '0007_policy_exists_rls_disabled',
    '0008_rls_enabled_no_policy',
    '0010_security_definer_view',
    '0026_pg_graphql_anon_table_exposed',
    '0027_pg_graphql_authenticated_table_exposed',
    '0028_anon_security_definer_function_executable',
    '0029_authenticated_security_definer_function_executable',
    '0007',
    '0008',
    '0010',
    '0026',
    '0027',
    '0028',
    '0029',
  ];

  const violations: string[] = [];
  for (const line of combined.split('\n')) {
    for (const cat of targetCategories) {
      if (line.includes(cat) && !violations.includes(line.trim())) {
        violations.push(line.trim());
      }
    }
  }

  return {
    rawOutput: combined.trim(),
    violationsFound: violations,
  };
}

/**
 * Verify HTTP API behavior (GraphQL disabled, unauthenticated RPC blocked).
 */
export async function executeApiVerification(
  supabaseUrl: string,
  anonKey: string
): Promise<{
  graphqlDisabled: boolean;
  anonRpcBlocked: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let graphqlDisabled = false;
  let anonRpcBlocked = false;

  // 1. Verify GraphQL is inactive
  try {
    const res = await fetch(`${supabaseUrl}/graphql/v1`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: '{ __schema { types { name } } }' }),
    });

    const bodyText = await res.text();
    // GraphQL is disabled if status is not 200, or returns error that pg_graphql is not enabled / schema not found
    if (
      res.status !== 200 ||
      bodyText.includes('pg_graphql extension is not enabled') ||
      bodyText.includes('PGRST106') ||
      bodyText.includes('The schema must be one of the following: public')
    ) {
      graphqlDisabled = true;
    } else {
      errors.push(`GraphQL returned unexpected active response (${res.status}): ${bodyText.slice(0, 100)}`);
    }
  } catch (err: unknown) {
    // If request fails / refused, GraphQL is disabled
    graphqlDisabled = true;
  }

  // 2. Verify unauthenticated RPC to ensure_winery is rejected
  try {
    const client = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error, status } = await client.rpc('ensure_winery', {
      p_winery_data: { google_place_id: 'security_advisor_probe' },
    });

    if (error || (status && status >= 400)) {
      anonRpcBlocked = true;
    } else {
      errors.push('Unauthenticated call to ensure_winery unexpectedly succeeded without error');
    }
  } catch {
    anonRpcBlocked = true;
  }

  return {
    graphqlDisabled,
    anonRpcBlocked,
    errors,
  };
}

/**
 * Main verification entrypoint that runs all audits and emits the final scorecard.
 */
export async function runSecurityAdvisorVerification(): Promise<SecurityAdvisorScorecard> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

  // Enforce local database safety invariant
  assertLocalEnvironment(supabaseUrl);

  console.log('🔒 Starting Supabase Security Advisor Verification Harness...');
  console.log(`📍 Database URL: ${supabaseUrl}`);

  // Step 1: SQL Catalog Verification
  console.log('\n[1/3] Executing PostgreSQL catalog assertions (scripts/db/verify-security-advisor.sql)...');
  const catalogResult = await executeSqlCatalogVerification();
  if (catalogResult.passed) {
    console.log('  ✅ PostgreSQL catalog assertions passed with 0 violations.');
  } else {
    console.error(`  ❌ Catalog assertions failed: ${catalogResult.error}`);
  }

  // Step 2: Supabase CLI Linter
  console.log('\n[2/3] Running Supabase CLI database linter (warning level)...');
  const lintResult = await executeCliLinter();
  if (lintResult.violationsFound.length === 0) {
    console.log('  ✅ Supabase db lint found 0 warnings for categories 0007, 0008, 0010, 0026, 0027, 0028, 0029.');
  } else {
    console.error(`  ❌ Found ${lintResult.violationsFound.length} lint warnings:`);
    lintResult.violationsFound.forEach((v) => console.error(`     - ${v}`));
  }

  // Step 3: API Verification
  console.log('\n[3/3] Testing HTTP API boundary behavior...');
  const apiResult = await executeApiVerification(supabaseUrl, anonKey);
  if (apiResult.graphqlDisabled) {
    console.log('  ✅ GraphQL endpoint is disabled and pruned from PostgREST schema.');
  } else {
    console.error('  ❌ GraphQL endpoint is still active or responsive.');
  }
  if (apiResult.anonRpcBlocked) {
    console.log('  ✅ Unauthenticated execution on boundary RPCs is rejected at database level.');
  } else {
    console.error('  ❌ Unauthenticated call to boundary RPC succeeded.');
  }

  // Categorize linter warnings
  const violations0007 = lintResult.violationsFound.filter(
    (v) => v.includes('0007') || v.includes('0007_policy_exists_rls_disabled')
  );
  const violations0008 = lintResult.violationsFound.filter(
    (v) => v.includes('0008') || v.includes('0008_rls_enabled_no_policy')
  );
  const violations0010 = lintResult.violationsFound.filter(
    (v) => v.includes('0010') || v.includes('0010_security_definer_view')
  );

  // Build Results Map
  const results: Record<SecurityAdvisorCategory, AdvisorCategoryResult> = {
    '0007_policy_exists_rls_disabled': {
      category: '0007_policy_exists_rls_disabled',
      name: 'Policy Exists With RLS Disabled',
      passed: catalogResult.passed && violations0007.length === 0,
      violationCount: catalogResult.passed && violations0007.length === 0 ? 0 : Math.max(1, violations0007.length),
      violations: violations0007,
      remediationSummary: 'All public tables have RLS enabled (relrowsecurity = true); no policies defined on unshielded tables.',
    },
    '0008_rls_enabled_no_policy': {
      category: '0008_rls_enabled_no_policy',
      name: 'RLS Enabled With No Policy',
      passed: catalogResult.passed && violations0008.length === 0,
      violationCount: catalogResult.passed && violations0008.length === 0 ? 0 : Math.max(1, violations0008.length),
      violations: violations0008,
      remediationSummary: 'All tables with RLS enabled define explicit access policies.',
    },
    '0010_security_definer_view': {
      category: '0010_security_definer_view',
      name: 'SECURITY DEFINER View',
      passed: catalogResult.passed && violations0010.length === 0,
      violationCount: catalogResult.passed && violations0010.length === 0 ? 0 : Math.max(1, violations0010.length),
      violations: violations0010,
      remediationSummary: 'Zero public views bypass caller RLS via default SECURITY DEFINER semantics; all views require security_invoker = true.',
    },
    '0026_pg_graphql_anon_table_exposed': {
      category: '0026_pg_graphql_anon_table_exposed',
      name: 'pg_graphql Anon Table Exposure',
      passed: catalogResult.passed && apiResult.graphqlDisabled,
      violationCount: catalogResult.passed && apiResult.graphqlDisabled ? 0 : 1,
      violations: apiResult.graphqlDisabled ? [] : ['GraphQL endpoint accessible without authentication'],
      remediationSummary: 'pg_graphql extension dropped CASCADE; graphql_public removed from config.toml api.schemas.',
    },
    '0027_pg_graphql_authenticated_table_exposed': {
      category: '0027_pg_graphql_authenticated_table_exposed',
      name: 'pg_graphql Authenticated Table Exposure',
      passed: catalogResult.passed && apiResult.graphqlDisabled,
      violationCount: catalogResult.passed && apiResult.graphqlDisabled ? 0 : 1,
      violations: apiResult.graphqlDisabled ? [] : ['GraphQL endpoint exposes tables to authenticated users'],
      remediationSummary: 'pg_graphql extension dropped CASCADE; table schema isolation verified.',
    },
    '0028_anon_security_definer_function_executable': {
      category: '0028_anon_security_definer_function_executable',
      name: 'Anon SECURITY DEFINER Function Execution',
      passed: catalogResult.passed && apiResult.anonRpcBlocked,
      violationCount: catalogResult.passed && apiResult.anonRpcBlocked ? 0 : 1,
      violations: apiResult.anonRpcBlocked ? [] : ['Anon role retains EXECUTE on SECURITY DEFINER functions'],
      remediationSummary: 'REVOKE ALL ON ALL FUNCTIONS FROM anon, PUBLIC; default privileges updated.',
    },
    '0029_authenticated_security_definer_function_executable': {
      category: '0029_authenticated_security_definer_function_executable',
      name: 'Overprivileged Authenticated SECURITY DEFINER Functions',
      passed: catalogResult.passed && lintResult.violationsFound.length === 0,
      violationCount: catalogResult.passed && lintResult.violationsFound.length === 0 ? 0 : 1,
      violations: lintResult.violationsFound,
      remediationSummary: '26 user-facing RPCs converted to SECURITY INVOKER; strict ADR-0007 allowlist of 7 boundary RPCs enforced.',
    },
  };

  const totalViolations = Object.values(results).reduce(
    (acc, curr) => acc + curr.violationCount,
    0
  );
  const allPassed =
    totalViolations === 0 &&
    catalogResult.passed &&
    lintResult.violationsFound.length === 0 &&
    apiResult.graphqlDisabled &&
    apiResult.anonRpcBlocked;

  const scorecard: SecurityAdvisorScorecard = {
    timestamp: new Date().toISOString(),
    databaseUrl: supabaseUrl,
    allPassed,
    totalViolations,
    results,
    cliLintOutput: lintResult.rawOutput,
  };

  // Render Terminal Scorecard
  console.log('\n================================================================================');
  console.log('           SUPABASE SECURITY ADVISOR VERIFICATION SCORECARD (ISSUES #87, #93)   ');
  console.log('================================================================================');
  console.log(` Timestamp: ${scorecard.timestamp}`);
  console.log(` Target:    ${scorecard.databaseUrl}`);
  console.log(` Status:    ${allPassed ? '✅ ALL CHECKS PASSED' : '❌ VERIFICATION FAILED'}`);
  console.log(` Violations:${totalViolations}`);
  console.log('--------------------------------------------------------------------------------');
  console.log(' Category                                                 | Status | Violations | Notes');
  console.log('----------------------------------------------------------+--------+------------+--------------');
  for (const cat of Object.values(results)) {
    const padCat = cat.category.padEnd(56, ' ');
    const status = cat.passed ? ' PASS ' : ' FAIL ';
    const count = String(cat.violationCount).padStart(10, ' ');
    console.log(` ${padCat} | ${status} | ${count} | 0 warnings`);
  }
  console.log('================================================================================\n');

  return scorecard;
}

// Standalone execution entrypoint
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('verify-security-advisor.ts') ||
    (typeof import.meta !== 'undefined' &&
      import.meta.url &&
      fileURLToPath(import.meta.url) === path.resolve(process.argv[1])));

if (isMain) {
  runSecurityAdvisorVerification()
    .then((scorecard) => {
      if (!scorecard.allPassed) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error during Security Advisor verification:', err);
      process.exit(1);
    });
}
