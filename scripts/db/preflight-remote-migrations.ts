/* eslint-disable no-console */
/**
 * scripts/db/preflight-remote-migrations.ts
 *
 * Remote Transactional Pre-Flight Gate (Layer 3 of ADR-0014).
 * Executes unapplied local migrations against the remote target database inside
 * a rolled-back transaction (`BEGIN ... ROLLBACK;`) with aggressive statement and lock
 * timeouts. Validates all DDL constraints, foreign keys, and indexes against live remote
 * production rows without persisting any mutations.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface LocalMigration {
  version: string;
  filename: string;
  filePath: string;
}

export type EnvironmentVariables = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type CommandExecutor = (command: string, env?: EnvironmentVariables) => string;

export interface PreflightOptions {
  env?: EnvironmentVariables;
  argv?: string[];
  executor?: CommandExecutor;
  migrationsDir?: string;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
  error?: (msg: string) => void;
}

export interface PreflightResult {
  success: boolean;
  skipped: boolean;
  pendingCount: number;
  pendingMigrations: string[];
  reason?: string;
  error?: string;
}

/**
 * Asserts AGENTS.md Guardrail #1 compliance:
 * Never execute against a remote URL unless process.env.CI === 'true' OR the explicit
 * CLI flag --confirm-remote-preflight is passed.
 */
export function assertRemotePreflightAuthorized(
  env: EnvironmentVariables = process.env,
  argv: string[] = process.argv.slice(2)
): void {
  const isCi = env.CI === 'true';
  const isExplicitlyConfirmed = argv.includes('--confirm-remote-preflight');

  if (!isCi && !isExplicitlyConfirmed) {
    throw new Error(
      "Safety Guardrail Triggered: Pre-flighting migrations against remote databases requires CI='true' or the explicit '--confirm-remote-preflight' flag. (AGENTS.md Guardrail #1)"
    );
  }
}

/**
 * Checks whether remote pre-flight should be safely skipped when SUPABASE_DB_URL
 * is absent (e.g. secretless PRs from forks or Dependabot).
 */
export function shouldSkipIfNoSecret(
  env: EnvironmentVariables = process.env,
  argv: string[] = process.argv.slice(2)
): boolean {
  const hasSkipFlag = argv.includes('--skip-if-no-secret');
  const dbUrl = env.SUPABASE_DB_URL;
  const isMissingUrl = !dbUrl || dbUrl.trim() === '';

  return hasSkipFlag && isMissingUrl;
}

/**
 * Normalizes PostgreSQL CONCURRENTLY index statements.
 * PostgreSQL disallows CREATE INDEX CONCURRENTLY and DROP INDEX CONCURRENTLY
 * within explicit transaction blocks (SQLSTATE 25001).
 */
export function normalizeConcurrently(sql: string): {
  normalizedSql: string;
  replacementsCount: number;
} {
  let count = 0;

  // 1. CREATE UNIQUE INDEX CONCURRENTLY -> CREATE UNIQUE INDEX
  const uniqueNormalized = sql.replace(
    /\b(create\s+unique\s+index)\s+concurrently\b(?:\s+)?/gi,
    (_match, prefix) => {
      count++;
      return `${prefix} `;
    }
  );

  // 2. CREATE INDEX CONCURRENTLY -> CREATE INDEX
  const indexNormalized = uniqueNormalized.replace(
    /\b(create\s+index)\s+concurrently\b(?:\s+)?/gi,
    (_match, prefix) => {
      count++;
      return `${prefix} `;
    }
  );

  // 3. DROP INDEX CONCURRENTLY -> DROP INDEX
  const dropNormalized = indexNormalized.replace(
    /\b(drop\s+index)\s+concurrently\b(?:\s+)?/gi,
    (_match, prefix) => {
      count++;
      return `${prefix} `;
    }
  );

  return {
    normalizedSql: dropNormalized,
    replacementsCount: count,
  };
}

/**
 * Constructs a single composite SQL script wrapping all pending migrations
 * inside a rolled-back transaction with aggressive lock and statement timeouts.
 */
export function buildCompositeRollbackScript(
  migrations: Array<{ version: string; filename: string; content: string }>
): { script: string; totalNormalized: number } {
  let totalNormalized = 0;
  const parts: string[] = [
    'BEGIN;',
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '30s';",
    '',
  ];

  for (const migration of migrations) {
    const { normalizedSql, replacementsCount } = normalizeConcurrently(migration.content);
    totalNormalized += replacementsCount;

    parts.push(
      `-- ============================================================================`,
      `-- Migration: ${migration.filename} (${migration.version})`,
      `-- ============================================================================`,
      normalizedSql.trim(),
      ''
    );
  }

  parts.push('ROLLBACK;');
  parts.push('');

  return {
    script: parts.join('\n'),
    totalNormalized,
  };
}

/**
 * Extracts applied migration versions from `supabase db query -o json` output.
 */
export function parseRemoteAppliedVersions(rawOutput: string): string[] {
  // Try array JSON first: [ { "version": "..." }, ... ] or []
  const arrayMatch = rawOutput.match(/\[[\s\S]*?\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item: { version?: string | number }) =>
            item && item.version !== undefined ? String(item.version) : ''
          )
          .filter(Boolean);
      }
    } catch {
      // Fall through to object matching
    }
  }

  // Try object JSON: { "rows": [ { "version": "..." }, ... ] }
  const objMatch = rawOutput.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (Array.isArray(parsed.rows)) {
        return parsed.rows
          .map((item: { version?: string | number }) =>
            item && item.version !== undefined ? String(item.version) : ''
          )
          .filter(Boolean);
      }
    } catch {
      // Fall through to error
    }
  }

  throw new Error(`Failed to parse applied migration versions from Supabase query output:\n${rawOutput}`);
}

/**
 * Scans local migrations directory and extracts valid timestamped migration files.
 */
export function getLocalMigrations(
  migrationsDir: string = path.resolve(process.cwd(), 'supabase/migrations')
): LocalMigration[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const migrations: LocalMigration[] = [];

  for (const entry of entries) {
    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }
    const match = entry.name.match(/^(\d{14})_(.+)\.sql$/);
    if (!match) {
      continue;
    }
    migrations.push({
      version: match[1],
      filename: entry.name,
      filePath: path.join(migrationsDir, entry.name),
    });
  }

  return migrations.sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * Filters local migrations returning those not yet present in applied remote versions.
 */
export function filterPendingMigrations(
  localMigrations: LocalMigration[],
  appliedVersions: string[]
): LocalMigration[] {
  const appliedSet = new Set(appliedVersions);
  return localMigrations
    .filter((m) => !appliedSet.has(m.version))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * Default child_process execution engine.
 */
export const defaultCommandExecutor: CommandExecutor = (
  command: string,
  env?: EnvironmentVariables
): string => {
  return execSync(command, {
    env: (env || process.env) as NodeJS.ProcessEnv,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
};

/**
 * Main orchestration function for remote transactional migration pre-flight.
 */
export async function runRemotePreflight(
  options: PreflightOptions = {}
): Promise<PreflightResult> {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const executor = options.executor || defaultCommandExecutor;
  const migrationsDir =
    options.migrationsDir || path.resolve(process.cwd(), 'supabase/migrations');
  const log = options.log || console.log;
  const warn = options.warn || console.warn;
  const errorLog = options.error || console.error;

  try {
    // 1. Secretless Skip Check
    if (shouldSkipIfNoSecret(env, argv)) {
      log('ℹ️ Skipping remote migration pre-flight: SUPABASE_DB_URL not available in this environment.');
      return {
        success: true,
        skipped: true,
        pendingCount: 0,
        pendingMigrations: [],
        reason: 'SUPABASE_DB_URL not available in this environment',
      };
    }

    // 2. Guardrail Safety Check
    assertRemotePreflightAuthorized(env, argv);

    // 3. Database URL validation
    const dbUrl = env.SUPABASE_DB_URL;
    if (!dbUrl || dbUrl.trim() === '') {
      throw new Error(
        'SUPABASE_DB_URL environment variable is required for remote migration pre-flight.'
      );
    }

    log('🔍 Discovering applied remote migrations...');

    // 4. Query applied remote migrations
    const queryCmd = `npx supabase db query --remote="${dbUrl}" --read-only -o json "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC"`;
    const queryOutput = executor(queryCmd, env);
    const appliedVersions = parseRemoteAppliedVersions(queryOutput);

    // 5. Discover local migrations
    const localMigrations = getLocalMigrations(migrationsDir);
    const pendingMigrations = filterPendingMigrations(localMigrations, appliedVersions);

    if (pendingMigrations.length === 0) {
      log('✅ 0 pending migrations; remote schema is up to date.');
      return {
        success: true,
        skipped: false,
        pendingCount: 0,
        pendingMigrations: [],
      };
    }

    log(`📋 Identified ${pendingMigrations.length} pending migration(s) to pre-flight:`);
    for (const p of pendingMigrations) {
      log(`   • ${p.filename}`);
    }

    // 6. Build composite rollback script
    const migrationContents = pendingMigrations.map((p) => ({
      version: p.version,
      filename: p.filename,
      content: fs.readFileSync(p.filePath, 'utf-8'),
    }));

    const { script, totalNormalized } = buildCompositeRollbackScript(migrationContents);
    if (totalNormalized > 0) {
      warn(
        `⚠️ Normalized ${totalNormalized} CONCURRENTLY index operation(s) to synchronous for transactional rollback.`
      );
    }

    // 7. Write temporary file and execute inside transaction
    const tmpFile = path.join(
      os.tmpdir(),
      `preflight-remote-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`
    );

    try {
      fs.writeFileSync(tmpFile, script, 'utf-8');

      log('🚀 Executing transactional pre-flight on remote database (BEGIN ... ROLLBACK)...');
      const preflightCmd = `npx supabase db query --remote="${dbUrl}" --file="${tmpFile}" --yes`;
      executor(preflightCmd, env);

      log(
        `✅ Pre-flight transactional rollback succeeded for ${pendingMigrations.length} pending migration(s). No changes persisted on remote.`
      );

      return {
        success: true,
        skipped: false,
        pendingCount: pendingMigrations.length,
        pendingMigrations: pendingMigrations.map((p) => p.filename),
      };
    } finally {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    }
  } catch (err: unknown) {
    const execError = err as { stderr?: string; stdout?: string; message?: string };
    const errText =
      [execError.stderr, execError.stdout].filter(Boolean).join('\n').trim() ||
      execError.message ||
      String(err);

    errorLog(`\n❌ Remote migration pre-flight failed: ${errText.trim()}`);

    return {
      success: false,
      skipped: false,
      pendingCount: 0,
      pendingMigrations: [],
      error: errText.trim(),
    };
  }
}

// Standalone execution entrypoint
const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).endsWith('scripts/db/preflight-remote-migrations.ts');

if (isMain) {
  runRemotePreflight({
    env: process.env,
    argv: process.argv.slice(2),
  })
    .then((result) => {
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('Fatal error during remote migration pre-flight:', err);
      process.exit(1);
    });
}
