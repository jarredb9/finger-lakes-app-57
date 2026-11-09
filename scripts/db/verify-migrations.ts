/**
 * scripts/db/verify-migrations.ts
 *
 * Layer 2: Two-Phase Local Adversarial Migration Replay Runner.
 * Implements verification against dirty/pre-existing rows adhering to ADR-0014.
 *
 * Replay sequence:
 *   1. npx supabase db reset --version 20261026000000 --no-seed
 *   2. npx supabase db query -f scripts/db/fixtures/adversarial-seed.sql
 *   3. npx supabase migration up
 *   4. npx supabase db query -o json -f scripts/db/fixtures/adversarial-verify.sql
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Migration anchor timestamp immediately preceding 20261104100000_harden_friends_and_profiles.sql.
 */
export const ANCHOR_MIGRATION_VERSION = '20261026000000';

/**
 * Path to adversarial dirty seed SQL fixture.
 */
export const ADVERSARIAL_SEED_FIXTURE_PATH = 'scripts/db/fixtures/adversarial-seed.sql';

/**
 * Path to survivor verification query SQL fixture.
 */
export const ADVERSARIAL_VERIFY_FIXTURE_PATH = 'scripts/db/fixtures/adversarial-verify.sql';

/**
 * Deterministic test user identifiers seeded in adversarial-seed.sql.
 */
export const ADVERSARIAL_TEST_USERS = {
  USER_A: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'adversarial_a@example.com',
    name: 'Adversarial User A',
  },
  USER_B: {
    id: '00000000-0000-4000-8000-000000000002',
    email: 'adversarial_b@example.com',
    name: 'Adversarial User B',
  },
  USER_C: {
    id: '00000000-0000-4000-8000-000000000003',
    email: 'ConflictUser@Example.com',
    name: 'Conflict User C',
  },
  USER_D: {
    id: '00000000-0000-4000-8000-000000000004',
    email: 'conflictuser@example.com',
    name: 'Conflict User D',
  },
} as const;

/**
 * SQL row shape returned by adversarial-verify.sql.
 */
export interface AdversarialSurvivorRow {
  self_referential_count: number;
  reciprocal_pair_count: number;
  survivor_friend_status: string | null;
  lower_email_conflict_count: number;
  duplicate_profile_email: string | null;
}

/**
 * Detailed evaluation scorecard for survivor assertions.
 */
export interface SurvivorEvaluationResult {
  allPassed: boolean;
  violations: string[];
  checks: {
    selfReferentialPassed: boolean;
    reciprocalPairPassed: boolean;
    deterministicPriorityPassed: boolean;
    emailDeduplicationPassed: boolean;
    emailNullSecondaryPassed: boolean;
  };
  observed?: AdversarialSurvivorRow;
}

/**
 * Full report returned by runTwoPhaseMigrationReplay.
 */
export interface ReplayReport {
  timestamp: string;
  databaseUrl: string;
  anchorVersion: string;
  allPassed: boolean;
  stepsExecuted: string[];
  evaluation?: SurvivorEvaluationResult;
  error?: string;
}

/**
 * Command executor signature supporting dependency injection in unit tests.
 */
export type CommandExecutor = (command: string, env?: NodeJS.ProcessEnv) => string;

/**
 * Options for configuring replay execution.
 */
export interface ReplayOptions {
  executor?: CommandExecutor;
  supabaseUrl?: string;
  seedFixturePath?: string;
  verifyFixturePath?: string;
  anchorVersion?: string;
  silent?: boolean;
}

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
 * Parses Unicode or ASCII box table format output into structured row objects.
 */
export function parseTableRows<T = Record<string, unknown>>(rawOutput: string): T[] {
  const lines = rawOutput
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('│'));

  if (lines.length < 2) {
    return [];
  }

  // Header line contains column names delimited by '│'
  const headerLine = lines[0];
  const headers = headerLine
    .split('│')
    .slice(1, -1)
    .map((c) => c.trim());

  if (headers.length === 0) {
    return [];
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip border/separator rows containing box-drawing lines
    if (line.includes('├') || line.includes('┼') || line.includes('─')) {
      continue;
    }

    const cells = line
      .split('│')
      .slice(1, -1)
      .map((c) => c.trim());

    if (cells.length !== headers.length) {
      continue;
    }

    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const val = cells[idx];
      if (val === 'NULL' || val === 'null' || val === '') {
        row[header] = null;
      } else if (/^-?\d+$/.test(val)) {
        row[header] = Number(val);
      } else if (/^-?\d+\.\d+$/.test(val)) {
        row[header] = Number(val);
      } else if (val.toLowerCase() === 'true') {
        row[header] = true;
      } else if (val.toLowerCase() === 'false') {
        row[header] = false;
      } else {
        row[header] = val;
      }
    });

    rows.push(row);
  }

  return rows as T[];
}

/**
 * Extracts and parses rows from Supabase CLI query output.
 * Supports bare JSON arrays, object-wrapped rows (AI agent mode), and table text fallback.
 */
export function extractQueryRows<T = Record<string, unknown>>(rawOutput: string): T[] {
  // 1. Try bare JSON array: [ { ... }, ... ]
  const arrayMatch = rawOutput.match(/\[[\s\S]*?\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed as T[];
      }
    } catch {
      // Fall through to object matching
    }
  }

  // 2. Try object JSON: { "rows": [ { ... }, ... ] }
  const jsonMatch = rawOutput.match(/\{[\s\S]*"rows"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed.rows)) {
        return parsed.rows as T[];
      }
    } catch {
      // Fall through to table fallback
    }
  }

  // 3. Try generic object JSON: { ... }
  const genericObjMatch = rawOutput.match(/\{[\s\S]*?\}/);
  if (genericObjMatch) {
    try {
      const parsed = JSON.parse(genericObjMatch[0]);
      if (Array.isArray(parsed.rows)) {
        return parsed.rows as T[];
      }
      if (Array.isArray(parsed)) {
        return parsed as T[];
      }
    } catch {
      // Fall through to table fallback
    }
  }

  // 4. Fallback: Parse Unicode or ASCII table output
  const tableRows = parseTableRows<T>(rawOutput);
  if (tableRows.length > 0) {
    return tableRows;
  }

  throw new Error(`Failed to extract query rows from Supabase query output: ${rawOutput}`);
}

/**
 * Evaluates survivor data invariants against expectations.
 */
export function evaluateSurvivorInvariants(
  rows: AdversarialSurvivorRow[]
): SurvivorEvaluationResult {
  const violations: string[] = [];

  if (!rows || rows.length === 0) {
    violations.push('No survivor assertion rows returned from database query.');
    return {
      allPassed: false,
      violations,
      checks: {
        selfReferentialPassed: false,
        reciprocalPairPassed: false,
        deterministicPriorityPassed: false,
        emailDeduplicationPassed: false,
        emailNullSecondaryPassed: false,
      },
    };
  }

  const row = rows[0];

  const selfReferentialPassed = Number(row.self_referential_count) === 0;
  if (!selfReferentialPassed) {
    violations.push(
      `Self-referential friendships survived migration: expected 0, got ${row.self_referential_count}.`
    );
  }

  const reciprocalPairPassed = Number(row.reciprocal_pair_count) === 1;
  if (!reciprocalPairPassed) {
    violations.push(
      `Reciprocal friendship pair deduplication failed: expected 1 row, got ${row.reciprocal_pair_count}.`
    );
  }

  const deterministicPriorityPassed = row.survivor_friend_status === 'accepted';
  if (!deterministicPriorityPassed) {
    violations.push(
      `Deterministic priority rule failed: expected status 'accepted', got '${row.survivor_friend_status}'.`
    );
  }

  const emailDeduplicationPassed = Number(row.lower_email_conflict_count) === 1;
  if (!emailDeduplicationPassed) {
    violations.push(
      `Case-insensitive email deduplication failed: expected 1 profile with lower(email), got ${row.lower_email_conflict_count}.`
    );
  }

  const emailNullSecondaryPassed =
    row.duplicate_profile_email === null || row.duplicate_profile_email === undefined;
  if (!emailNullSecondaryPassed) {
    violations.push(
      `Secondary duplicate profile email was not nulled: expected NULL, got '${row.duplicate_profile_email}'.`
    );
  }

  const allPassed =
    selfReferentialPassed &&
    reciprocalPairPassed &&
    deterministicPriorityPassed &&
    emailDeduplicationPassed &&
    emailNullSecondaryPassed;

  return {
    allPassed,
    violations,
    checks: {
      selfReferentialPassed,
      reciprocalPairPassed,
      deterministicPriorityPassed,
      emailDeduplicationPassed,
      emailNullSecondaryPassed,
    },
    observed: row,
  };
}

/**
 * Default child_process execution engine.
 */
export const defaultCommandExecutor: CommandExecutor = (
  command: string,
  env?: NodeJS.ProcessEnv
): string => {
  return execSync(command, {
    env: env || process.env,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
};

/**
 * Builds process environment with DOCKER_HOST and PATH prepended.
 */
function buildProcessEnv(): NodeJS.ProcessEnv {
  const dockerHost = resolveDockerHost();
  const binPath = path.resolve(process.cwd(), 'scripts/bin');
  return {
    ...process.env,
    PATH: process.env.PATH ? `${binPath}:${process.env.PATH}` : binPath,
    ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}),
  };
}

/**
 * Executes two-phase adversarial migration replay and reports results.
 */
export async function runTwoPhaseMigrationReplay(
  options: ReplayOptions = {}
): Promise<ReplayReport> {
  const supabaseUrl =
    options.supabaseUrl ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'http://127.0.0.1:54321';
  const anchorVersion = options.anchorVersion || ANCHOR_MIGRATION_VERSION;
  const seedFixturePath = options.seedFixturePath || ADVERSARIAL_SEED_FIXTURE_PATH;
  const verifyFixturePath = options.verifyFixturePath || ADVERSARIAL_VERIFY_FIXTURE_PATH;
  const executor = options.executor || defaultCommandExecutor;
  const silent = !!options.silent;

  // Guardrail invariant: ensure target environment is local
  assertLocalEnvironment(supabaseUrl);

  const env = buildProcessEnv();
  const stepsExecuted: string[] = [];

  const log = (msg: string) => {
    if (!silent) {
      console.log(msg);
    }
  };

  log('🧪 Starting Two-Phase Local Adversarial Migration Replay (ADR-0014)...');
  log(`📍 Target Stack: ${supabaseUrl}`);
  log(`⚓ Anchor Version: ${anchorVersion}`);
  log(`🌱 Adversarial Seed: ${seedFixturePath}\n`);

  try {
    // Step 1: Reset database to anchor migration without seed
    const step1Cmd = `npx supabase db reset --version ${anchorVersion} --no-seed`;
    log(`[1/4] Replaying schema to pre-tightening anchor: ${step1Cmd}...`);
    executor(step1Cmd, env);
    stepsExecuted.push(step1Cmd);
    log('  ✅ Schema reset to anchor version successfully.');

    // Step 2: Inject adversarial dirty seed fixture
    const step2Cmd = `npx supabase db query -f ${seedFixturePath}`;
    log(`\n[2/4] Injecting adversarial dirty data: ${step2Cmd}...`);
    executor(step2Cmd, env);
    stepsExecuted.push(step2Cmd);
    log('  ✅ Adversarial dirty fixture injected successfully.');

    // Step 3: Apply post-anchor migrations
    const step3Cmd = 'npx supabase migration up';
    log(`\n[3/4] Running migration up against dirty rows: ${step3Cmd}...`);
    executor(step3Cmd, env);
    stepsExecuted.push(step3Cmd);
    log('  ✅ Migrations applied cleanly across pre-existing dirty records.');

    // Step 4: Verify survivor rows match deterministic data reconciliation rules
    const step4Cmd = `npx supabase db query -o json -f ${verifyFixturePath}`;
    log(`\n[4/4] Executing survivor assertion query: ${step4Cmd}...`);
    const queryOutput = executor(step4Cmd, env);
    stepsExecuted.push(step4Cmd);

    const rows = extractQueryRows<AdversarialSurvivorRow>(queryOutput);
    const evaluation = evaluateSurvivorInvariants(rows);

    // Render Terminal Scorecard
    if (!silent) {
      log('\n================================================================================');
      log('           TWO-PHASE ADVERSARIAL MIGRATION REPLAY SCORECARD (ADR-0014)          ');
      log('================================================================================');
      log(` Timestamp:        ${new Date().toISOString()}`);
      log(` Anchor Version:   ${anchorVersion}`);
      log(` Target Stack:     ${supabaseUrl}`);
      log(` Status:           ${evaluation.allPassed ? '✅ ALL CHECKS PASSED' : '❌ VERIFICATION FAILED'}`);
      log('--------------------------------------------------------------------------------');
      log(' Check                                      | Expected | Observed | Status');
      log('--------------------------------------------+----------+----------+--------');

      const observed = evaluation.observed;
      const selfRefObs = observed ? String(observed.self_referential_count) : 'N/A';
      const selfRefStatus = evaluation.checks.selfReferentialPassed ? ' PASS ' : ' FAIL ';
      log(` Self-referential friendships scrubbed      | 0        | ${selfRefObs.padEnd(8, ' ')} | ${selfRefStatus}`);

      const recipObs = observed ? String(observed.reciprocal_pair_count) : 'N/A';
      const recipStatus = evaluation.checks.reciprocalPairPassed ? ' PASS ' : ' FAIL ';
      log(` Reciprocal friendship pairs deduplicated   | 1        | ${recipObs.padEnd(8, ' ')} | ${recipStatus}`);

      const statusObs = observed?.survivor_friend_status || 'null';
      const statusStatus = evaluation.checks.deterministicPriorityPassed ? ' PASS ' : ' FAIL ';
      log(` Reciprocal pair deterministic status       | accepted | ${statusObs.padEnd(8, ' ')} | ${statusStatus}`);

      const emailObs = observed ? String(observed.lower_email_conflict_count) : 'N/A';
      const emailStatus = evaluation.checks.emailDeduplicationPassed ? ' PASS ' : ' FAIL ';
      log(` Mixed-case email deduplication (conflict)  | 1        | ${emailObs.padEnd(8, ' ')} | ${emailStatus}`);

      const nullEmailObs = observed?.duplicate_profile_email ?? 'null';
      const nullEmailStatus = evaluation.checks.emailNullSecondaryPassed ? ' PASS ' : ' FAIL ';
      log(` Duplicate profile email nulled             | null     | ${String(nullEmailObs).padEnd(8, ' ')} | ${nullEmailStatus}`);
      log('================================================================================\n');

      if (!evaluation.allPassed) {
        console.error('❌ Survivor assertion violations:');
        evaluation.violations.forEach((v) => console.error(`   - ${v}`));
      }
    }

    return {
      timestamp: new Date().toISOString(),
      databaseUrl: supabaseUrl,
      anchorVersion,
      allPassed: evaluation.allPassed,
      stepsExecuted,
      evaluation,
    };
  } catch (error: unknown) {
    const execError = error as { stderr?: string; stdout?: string; message?: string };
    const stdErrText = [execError.stderr, execError.stdout].filter(Boolean).join('\n').trim();
    const errText = stdErrText || execError.message || String(error);

    if (!silent) {
      console.error(`\n❌ Error during two-phase migration replay: ${errText.trim()}`);
    }

    return {
      timestamp: new Date().toISOString(),
      databaseUrl: supabaseUrl,
      anchorVersion,
      allPassed: false,
      stepsExecuted,
      error: errText.trim(),
    };
  }
}

// Standalone execution entrypoint
const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).endsWith('scripts/db/verify-migrations.ts');

if (isMain) {
  runTwoPhaseMigrationReplay()
    .then((report) => {
      if (!report.allPassed) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error during two-phase migration replay:', err);
      process.exit(1);
    });
}
