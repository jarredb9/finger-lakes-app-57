import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assertRemotePreflightAuthorized,
  shouldSkipIfNoSecret,
  normalizeConcurrently,
  buildCompositeRollbackScript,
  parseRemoteAppliedVersions,
  filterPendingMigrations,
  getLocalMigrations,
  runRemotePreflight,
  type LocalMigration,
  type CommandExecutor,
} from '../preflight-remote-migrations';

describe('preflight-remote-migrations: safety guardrail', () => {
  it('rejects execution when CI is unset and --confirm-remote-preflight is omitted', () => {
    expect(() =>
      assertRemotePreflightAuthorized({ CI: undefined }, [])
    ).toThrow(/Safety Guardrail Triggered/);

    expect(() =>
      assertRemotePreflightAuthorized({ CI: 'false' }, ['--other-flag'])
    ).toThrow(/Safety Guardrail Triggered/);
  });

  it('allows execution when CI is "true"', () => {
    expect(() =>
      assertRemotePreflightAuthorized({ CI: 'true' }, [])
    ).not.toThrow();
  });

  it('allows execution when --confirm-remote-preflight is passed without CI', () => {
    expect(() =>
      assertRemotePreflightAuthorized({}, ['--confirm-remote-preflight'])
    ).not.toThrow();
  });

  it('detects --skip-if-no-secret when SUPABASE_DB_URL is unset or empty', () => {
    expect(shouldSkipIfNoSecret({}, ['--skip-if-no-secret'])).toBe(true);
    expect(shouldSkipIfNoSecret({ SUPABASE_DB_URL: '' }, ['--skip-if-no-secret'])).toBe(true);
    expect(shouldSkipIfNoSecret({ SUPABASE_DB_URL: '   ' }, ['--skip-if-no-secret'])).toBe(true);
  });

  it('does not skip when SUPABASE_DB_URL is provided', () => {
    expect(
      shouldSkipIfNoSecret(
        { SUPABASE_DB_URL: 'postgresql://postgres:pass@db.example.com:5432/postgres' },
        ['--skip-if-no-secret']
      )
    ).toBe(false);
  });

  it('does not skip when --skip-if-no-secret flag is omitted even if SUPABASE_DB_URL is missing', () => {
    expect(shouldSkipIfNoSecret({}, [])).toBe(false);
  });
});

describe('preflight-remote-migrations: CONCURRENTLY normalization', () => {
  it('normalizes CREATE INDEX CONCURRENTLY to CREATE INDEX', () => {
    const sql = 'CREATE INDEX CONCURRENTLY idx_wineries_name ON public.wineries (name);';
    const { normalizedSql, replacementsCount } = normalizeConcurrently(sql);
    expect(normalizedSql).toBe('CREATE INDEX idx_wineries_name ON public.wineries (name);');
    expect(replacementsCount).toBe(1);
  });

  it('normalizes CREATE UNIQUE INDEX CONCURRENTLY to CREATE UNIQUE INDEX', () => {
    const sql =
      'CREATE UNIQUE INDEX CONCURRENTLY idx_friends_pair ON public.friends (user1_id, user2_id);';
    const { normalizedSql, replacementsCount } = normalizeConcurrently(sql);
    expect(normalizedSql).toBe(
      'CREATE UNIQUE INDEX idx_friends_pair ON public.friends (user1_id, user2_id);'
    );
    expect(replacementsCount).toBe(1);
  });

  it('normalizes DROP INDEX CONCURRENTLY to DROP INDEX', () => {
    const sql = 'DROP INDEX CONCURRENTLY IF EXISTS idx_legacy_idx;';
    const { normalizedSql, replacementsCount } = normalizeConcurrently(sql);
    expect(normalizedSql).toBe('DROP INDEX IF EXISTS idx_legacy_idx;');
    expect(replacementsCount).toBe(1);
  });

  it('handles multiple occurrences, mixed case, and variable whitespace', () => {
    const sql = `
      create   unique   index   concurrently   idx_a on table_a (col);
      create   index   CONCURRENTLY   idx_b on table_b (col);
      drop index concurrently if exists idx_c;
    `;
    const { normalizedSql, replacementsCount } = normalizeConcurrently(sql);
    expect(normalizedSql).toContain('create   unique   index idx_a on table_a (col);');
    expect(normalizedSql).toContain('create   index idx_b on table_b (col);');
    expect(normalizedSql).toContain('drop index if exists idx_c;');
    expect(replacementsCount).toBe(3);
  });

  it('leaves standard non-concurrent index statements untouched', () => {
    const sql = `
      CREATE INDEX idx_regular ON public.trips (user_id);
      CREATE UNIQUE INDEX idx_unique ON public.profiles (email);
      DROP INDEX IF EXISTS idx_old;
    `;
    const { normalizedSql, replacementsCount } = normalizeConcurrently(sql);
    expect(normalizedSql).toBe(sql);
    expect(replacementsCount).toBe(0);
  });
});

describe('preflight-remote-migrations: composite rollback script generation', () => {
  it('wraps pending migrations inside BEGIN ... ROLLBACK with lock and statement timeouts', () => {
    const migrations = [
      {
        version: '20261104100000',
        filename: '20261104100000_harden_friends.sql',
        content:
          'CREATE UNIQUE INDEX CONCURRENTLY idx_friends_pair ON public.friends (user1_id, user2_id);',
      },
      {
        version: '20261104110000',
        filename: '20261104110000_harden_trips.sql',
        content: 'ALTER TABLE public.trips ADD COLUMN archived_at TIMESTAMPTZ;',
      },
    ];

    const { script, totalNormalized } = buildCompositeRollbackScript(migrations);

    expect(script.startsWith('BEGIN;')).toBe(true);
    expect(script).toContain("SET LOCAL lock_timeout = '5s';");
    expect(script).toContain("SET LOCAL statement_timeout = '30s';");
    expect(script).toContain('-- Migration: 20261104100000_harden_friends.sql (20261104100000)');
    expect(script).toContain(
      'CREATE UNIQUE INDEX idx_friends_pair ON public.friends (user1_id, user2_id);'
    );
    expect(script).toContain('-- Migration: 20261104110000_harden_trips.sql (20261104110000)');
    expect(script).toContain('ALTER TABLE public.trips ADD COLUMN archived_at TIMESTAMPTZ;');
    expect(script.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(totalNormalized).toBe(1);
  });
});

describe('preflight-remote-migrations: remote version discovery & filtering', () => {
  it('parses array-format JSON from CLI output with surrounding noise', () => {
    const rawOutput = `
Target: remote (postgresql://...)
A new version of Supabase CLI is available: v3.1.0
[
  { "version": "20260528000000" },
  { "version": "20260601000000" },
  { "version": "20261026000000" }
]
Pass --yes to accept.
    `;
    const versions = parseRemoteAppliedVersions(rawOutput);
    expect(versions).toEqual(['20260528000000', '20260601000000', '20261026000000']);
  });

  it('parses rows-object JSON from CLI output', () => {
    const rawOutput = `
{
  "rows": [
    { "version": "20260528000000" },
    { "version": "20260601000000" }
  ]
}
    `;
    const versions = parseRemoteAppliedVersions(rawOutput);
    expect(versions).toEqual(['20260528000000', '20260601000000']);
  });

  it('throws descriptive error if JSON cannot be parsed from output', () => {
    expect(() => parseRemoteAppliedVersions('No JSON output available')).toThrow(
      /Failed to parse applied migration versions/
    );
  });

  it('filters pending local migrations against applied versions and preserves ascending order', () => {
    const localMigrations: LocalMigration[] = [
      { version: '20260528000000', filename: '20260528000000_init.sql', filePath: '/path/1' },
      { version: '20260601000000', filename: '20260601000000_feat.sql', filePath: '/path/2' },
      { version: '20261104100000', filename: '20261104100000_patch1.sql', filePath: '/path/3' },
      { version: '20261104110000', filename: '20261104110000_patch2.sql', filePath: '/path/4' },
    ];
    const appliedVersions = ['20260528000000', '20260601000000'];

    const pending = filterPendingMigrations(localMigrations, appliedVersions);
    expect(pending).toHaveLength(2);
    expect(pending[0].version).toBe('20261104100000');
    expect(pending[1].version).toBe('20261104110000');
  });

  it('returns empty list when all local migrations are already applied', () => {
    const localMigrations: LocalMigration[] = [
      { version: '20260528000000', filename: '20260528000000_init.sql', filePath: '/path/1' },
    ];
    const appliedVersions = ['20260528000000', '20260601000000'];

    const pending = filterPendingMigrations(localMigrations, appliedVersions);
    expect(pending).toHaveLength(0);
  });
});

describe('preflight-remote-migrations: getLocalMigrations', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-migrations-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers only valid timestamped migration sql files in ascending order', () => {
    fs.writeFileSync(path.join(tmpDir, '20261104110000_second.sql'), '-- sql 2');
    fs.writeFileSync(path.join(tmpDir, '20261104100000_first.sql'), '-- sql 1');
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Ignore me');
    fs.writeFileSync(path.join(tmpDir, '.DS_Store'), '');

    const list = getLocalMigrations(tmpDir);
    expect(list).toHaveLength(2);
    expect(list[0].version).toBe('20261104100000');
    expect(list[0].filename).toBe('20261104100000_first.sql');
    expect(list[1].version).toBe('20261104110000');
    expect(list[1].filename).toBe('20261104110000_second.sql');
  });
});

describe('preflight-remote-migrations: runRemotePreflight orchestration', () => {
  let tmpDir: string;
  const mockDbUrl = 'postgresql://postgres:secret@db.supabase.co:5432/postgres';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-orchestration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects execution when neither CI nor --confirm-remote-preflight is present', async () => {
    const logs: string[] = [];
    const result = await runRemotePreflight({
      env: { CI: undefined, SUPABASE_DB_URL: mockDbUrl },
      argv: [],
      migrationsDir: tmpDir,
      log: (msg) => logs.push(msg),
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Safety Guardrail Triggered/);
  });

  it('skips gracefully when --skip-if-no-secret is passed and SUPABASE_DB_URL is empty, even without CI set', async () => {
    const logs: string[] = [];
    const result = await runRemotePreflight({
      env: { CI: undefined, SUPABASE_DB_URL: '' },
      argv: ['--skip-if-no-secret'],
      migrationsDir: tmpDir,
      log: (msg) => logs.push(msg),
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(logs.some((l) => l.includes('Skipping remote migration pre-flight'))).toBe(true);
  });

  it('fails if SUPABASE_DB_URL is missing and --skip-if-no-secret was not specified', async () => {
    const result = await runRemotePreflight({
      env: { CI: 'true', SUPABASE_DB_URL: '' },
      argv: [],
      migrationsDir: tmpDir,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/SUPABASE_DB_URL environment variable is required/);
  });

  it('reports 0 pending migrations when remote matches local schema', async () => {
    fs.writeFileSync(path.join(tmpDir, '20260528000000_init.sql'), '-- init');

    const commandsExecuted: string[] = [];
    const mockExecutor: CommandExecutor = (cmd: string) => {
      commandsExecuted.push(cmd);
      return JSON.stringify([{ version: '20260528000000' }]);
    };

    const logs: string[] = [];
    const result = await runRemotePreflight({
      env: { CI: 'true', SUPABASE_DB_URL: mockDbUrl },
      argv: [],
      migrationsDir: tmpDir,
      executor: mockExecutor,
      log: (msg) => logs.push(msg),
    });

    expect(result.success).toBe(true);
    expect(result.pendingCount).toBe(0);
    expect(result.skipped).toBe(false);
    expect(commandsExecuted).toHaveLength(1);
    expect(commandsExecuted[0]).toContain('SELECT version FROM supabase_migrations.schema_migrations');
    expect(logs.some((l) => l.includes('0 pending migrations; remote schema is up to date'))).toBe(true);
  });

  it('executes rolled-back composite transaction for pending migrations', async () => {
    fs.writeFileSync(path.join(tmpDir, '20260528000000_init.sql'), '-- init');
    fs.writeFileSync(
      path.join(tmpDir, '20261104100000_new.sql'),
      'CREATE UNIQUE INDEX CONCURRENTLY idx_test ON public.test (id);'
    );

    const commandsExecuted: string[] = [];
    let executedSqlContent = '';

    const mockExecutor: CommandExecutor = (cmd: string) => {
      commandsExecuted.push(cmd);
      if (cmd.includes('SELECT version FROM supabase_migrations.schema_migrations')) {
        return JSON.stringify([{ version: '20260528000000' }]);
      }
      // Query with --file
      const fileMatch = cmd.match(/--file="?([^"\s]+)"?/);
      if (fileMatch) {
        executedSqlContent = fs.readFileSync(fileMatch[1], 'utf-8');
      }
      return 'OK';
    };

    const logs: string[] = [];
    const result = await runRemotePreflight({
      env: { CI: 'true', SUPABASE_DB_URL: mockDbUrl },
      argv: [],
      migrationsDir: tmpDir,
      executor: mockExecutor,
      log: (msg) => logs.push(msg),
    });

    expect(result.success).toBe(true);
    expect(result.pendingCount).toBe(1);
    expect(commandsExecuted).toHaveLength(2);
    expect(executedSqlContent.startsWith('BEGIN;')).toBe(true);
    expect(executedSqlContent).toContain('CREATE UNIQUE INDEX idx_test ON public.test (id);');
    expect(executedSqlContent.trim().endsWith('ROLLBACK;')).toBe(true);
    expect(logs.some((l) => l.includes('Pre-flight transactional rollback succeeded'))).toBe(true);
  });

  it('handles and surfaces execution failure during transactional rollback', async () => {
    fs.writeFileSync(path.join(tmpDir, '20261104100000_broken.sql'), 'INVALID SQL STATEMENT;');

    const mockExecutor: CommandExecutor = (cmd: string) => {
      if (cmd.includes('SELECT version FROM supabase_migrations.schema_migrations')) {
        return JSON.stringify([]);
      }
      throw new Error('syntax error at or near "INVALID"');
    };

    const errors: string[] = [];
    const result = await runRemotePreflight({
      env: { CI: 'true', SUPABASE_DB_URL: mockDbUrl },
      argv: [],
      migrationsDir: tmpDir,
      executor: mockExecutor,
      error: (msg) => errors.push(msg),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('syntax error at or near "INVALID"');
    expect(errors.some((e) => e.includes('Remote migration pre-flight failed'))).toBe(true);
  });
});
