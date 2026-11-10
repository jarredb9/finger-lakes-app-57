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

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Client, type ClientConfig } from 'pg';
import {
  defaultCommandExecutor,
  type CommandExecutor,
  type EnvironmentVariables,
} from './db-utils';

export {
  defaultCommandExecutor,
  type CommandExecutor,
  type EnvironmentVariables,
};

// Load environment variables from .env.local and .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface LocalMigration {
  version: string;
  filename: string;
  filePath: string;
}


export type SqlRunner = (dbUrl: string, sql: string) => Promise<void>;

export type RemoteVersionFetcher = (dbUrl: string) => Promise<string[]>;

export interface PreflightOptions {
  env?: EnvironmentVariables;
  argv?: string[];
  executor?: CommandExecutor;
  sqlRunner?: SqlRunner;
  fetchAppliedVersions?: RemoteVersionFetcher;
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
  // Try array JSON first: test all candidate bracketed substrings
  const arrayMatches = rawOutput.matchAll(/\[[\s\S]*?\]/g);
  for (const match of arrayMatches) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item: { version?: string | number }) =>
            item && item.version !== undefined ? String(item.version) : ''
          )
          .filter(Boolean);
      }
    } catch {
      // Continue to next match candidate
    }
  }

  // Try finding from first '[' to last ']' in case non-greedy match split arrays
  const firstBracket = rawOutput.indexOf('[');
  const lastBracket = rawOutput.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      const parsed = JSON.parse(rawOutput.slice(firstBracket, lastBracket + 1));
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
  const objMatches = rawOutput.matchAll(/\{[\s\S]*\}/g);
  for (const match of objMatches) {
    try {
      const parsed = JSON.parse(match[0]);
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
 * Resolves ClientConfig for pg.Client based on database URL and target environment.
 * Sets rejectUnauthorized: false for hosted remote databases to accommodate SSL poolers,
 * while leaving local connections without SSL.
 * Strips sslmode from connectionString URL parameters so pg-connection-string does not
 * overwrite explicit SSL settings.
 */
export function getPgClientConfig(connectionString: string): ClientConfig {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const sslMode = url.searchParams.get('sslmode');

    // Remove sslmode query parameter so pg-connection-string doesn't override our explicit ssl config
    url.searchParams.delete('sslmode');
    const sanitizedConnectionString = url.toString();

    if (sslMode === 'disable' || (isLocal && sslMode !== 'require')) {
      return { connectionString: sanitizedConnectionString };
    }
    return {
      connectionString: sanitizedConnectionString,
      ssl: { rejectUnauthorized: false },
    };
  } catch {
    return {
      connectionString,
      ssl: { rejectUnauthorized: false },
    };
  }
}

/**
 * Default applied migration version discovery using node-postgres (pg) Simple Query Protocol.
 * Directly reads applied migration versions from supabase_migrations.schema_migrations.
 */
export async function defaultFetchRemoteAppliedVersions(dbUrl: string): Promise<string[]> {
  const config = getPgClientConfig(dbUrl);
  const client = new Client(config);
  await client.connect();
  try {
    const res = await client.query<{ version: string | number }>(
      'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC'
    );
    return res.rows
      .map((row) => (row && row.version !== undefined ? String(row.version) : ''))
      .filter(Boolean);
  } finally {
    await client.end();
  }
}

/**
 * Default SQL runner using node-postgres (pg) Simple Query Protocol.
 * Simple Query Protocol allows multiple commands separated by semicolons
 * inside a single transactional block (BEGIN ... ROLLBACK;).
 */
export async function defaultSqlRunner(dbUrl: string, sql: string): Promise<void> {
  const config = getPgClientConfig(dbUrl);
  const client = new Client(config);
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

/**
 * Main orchestration function for remote transactional migration pre-flight.
 */
export async function runRemotePreflight(
  options: PreflightOptions = {}
): Promise<PreflightResult> {
  const env = options.env || process.env;
  const argv = options.argv || process.argv.slice(2);
  const executor = options.executor || defaultCommandExecutor;
  const sqlRunner = options.sqlRunner || defaultSqlRunner;
  const fetchAppliedVersions =
    options.fetchAppliedVersions || defaultFetchRemoteAppliedVersions;
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
    let appliedVersions: string[];
    if (options.executor && !options.fetchAppliedVersions) {
      const queryCmd = `npx supabase db query --remote="${dbUrl}" --read-only -o json "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC"`;
      const queryOutput = executor(queryCmd, env);
      appliedVersions = parseRemoteAppliedVersions(queryOutput);
    } else {
      appliedVersions = await fetchAppliedVersions(dbUrl);
    }

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

    // 7. Execute inside transaction using Simple Query Protocol
    log('🚀 Executing transactional pre-flight on remote database (BEGIN ... ROLLBACK)...');
    await sqlRunner(dbUrl, script);

    log(
      `✅ Pre-flight transactional rollback succeeded for ${pendingMigrations.length} pending migration(s). No changes persisted on remote.`
    );

    return {
      success: true,
      skipped: false,
      pendingCount: pendingMigrations.length,
      pendingMigrations: pendingMigrations.map((p) => p.filename),
    };
  } catch (err: unknown) {
    const execError = err as { stderr?: string; stdout?: string; message?: string; detail?: string };
    const errText =
      [execError.stderr, execError.stdout].filter(Boolean).join('\n').trim() ||
      (execError.message ? `${execError.message}${execError.detail ? ` (${execError.detail})` : ''}` : '') ||
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
