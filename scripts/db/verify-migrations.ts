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

import * as fs from 'fs';
import * as path from 'path';
import {
  assertLocalEnvironment,
  resolveDockerHost,
  buildProcessEnv,
  defaultCommandExecutor,
  type CommandExecutor,
  type EnvironmentVariables,
} from './db-utils';
import {
  buildCompositeRollbackScript,
  defaultSqlRunner,
  getLocalMigrations,
  type SqlRunner,
} from './preflight-remote-migrations';

export {
  assertLocalEnvironment,
  resolveDockerHost,
  defaultCommandExecutor,
  type CommandExecutor,
  type EnvironmentVariables,
  type SqlRunner,
};

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
 * Options for configuring replay execution.
 */
export interface ReplayOptions {
  executor?: CommandExecutor;
  sqlRunner?: SqlRunner;
  localDbUrl?: string;
  supabaseUrl?: string;
  seedFixturePath?: string;
  verifyFixturePath?: string;
  anchorVersion?: string;
  migrationsDir?: string;
  silent?: boolean;
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
 * Executes two-phase adversarial migration replay and reports results.
 */
export async function runTwoPhaseMigrationReplay(
  options: ReplayOptions = {}
): Promise<ReplayReport> {
  const supabaseUrl =
    options.supabaseUrl ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'http://127.0.0.1:54321';
  const localDbUrl =
    options.localDbUrl ||
    process.env.LOCAL_DB_URL ||
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  const anchorVersion = options.anchorVersion || ANCHOR_MIGRATION_VERSION;
  const seedFixturePath = options.seedFixturePath || ADVERSARIAL_SEED_FIXTURE_PATH;
  const verifyFixturePath = options.verifyFixturePath || ADVERSARIAL_VERIFY_FIXTURE_PATH;
  const migrationsDir =
    options.migrationsDir || path.resolve(process.cwd(), 'supabase/migrations');
  const executor = options.executor || defaultCommandExecutor;
  const sqlRunner = options.sqlRunner || defaultSqlRunner;
  const silent = !!options.silent;

  // Guardrail invariant: ensure target environments are local
  assertLocalEnvironment(supabaseUrl);
  assertLocalEnvironment(localDbUrl);

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
    log(`[1/5] Replaying schema to pre-tightening anchor: ${step1Cmd}...`);
    executor(step1Cmd, env);
    stepsExecuted.push(step1Cmd);
    log('  ✅ Schema reset to anchor version successfully.');

    // Step 2: Inject adversarial dirty seed fixture
    const step2Cmd = `npx supabase db query -f ${seedFixturePath}`;
    log(`\n[2/5] Injecting adversarial dirty data: ${step2Cmd}...`);
    executor(step2Cmd, env);
    stepsExecuted.push(step2Cmd);
    log('  ✅ Adversarial dirty fixture injected successfully.');

    // Step 3: Test composite transactional rollback against local database
    log(`\n[3/5] Testing composite transactional rollback against local database (BEGIN ... ROLLBACK)...`);
    const localMigrations = getLocalMigrations(migrationsDir);
    const postAnchorMigrations = localMigrations.filter(
      (m) => m.version > anchorVersion
    );

    if (postAnchorMigrations.length === 0) {
      log('  ℹ️ 0 post-anchor migrations found; skipping composite rollback pre-flight.');
    } else {
      log(`  📋 Identified ${postAnchorMigrations.length} post-anchor migration(s) for composite rollback:`);
      for (const m of postAnchorMigrations) {
        log(`     • ${m.filename}`);
      }
      const migrationContents = postAnchorMigrations.map((m) => ({
        version: m.version,
        filename: m.filename,
        content: fs.readFileSync(m.filePath, 'utf-8'),
      }));
      const { script, totalNormalized } = buildCompositeRollbackScript(migrationContents);
      if (totalNormalized > 0) {
        log(
          `  ⚠️ Normalized ${totalNormalized} CONCURRENTLY index operation(s) to synchronous for transactional rollback.`
        );
      }

      await sqlRunner(localDbUrl, script);
      log('  ✅ Composite rollback transaction completed and rolled back cleanly.');
    }
    stepsExecuted.push(`composite rollback preflight (${postAnchorMigrations.length} migrations)`);

    // Step 4: Apply post-anchor migrations
    const step4Cmd = 'npx supabase migration up';
    log(`\n[4/5] Running migration up against dirty rows: ${step4Cmd}...`);
    executor(step4Cmd, env);
    stepsExecuted.push(step4Cmd);
    log('  ✅ Migrations applied cleanly across pre-existing dirty records.');

    // Step 5: Verify survivor rows match deterministic data reconciliation rules
    const step5Cmd = `npx supabase db query -o json -f ${verifyFixturePath}`;
    log(`\n[5/5] Executing survivor assertion query: ${step5Cmd}...`);
    const queryOutput = executor(step5Cmd, env);
    stepsExecuted.push(step5Cmd);

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
    const execError = error as { stderr?: string; stdout?: string; message?: string; detail?: string };
    const stdErrText = [execError.stderr, execError.stdout].filter(Boolean).join('\n').trim();
    const errText =
      stdErrText ||
      (execError.message ? `${execError.message}${execError.detail ? ` (${execError.detail})` : ''}` : '') ||
      String(error);

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
