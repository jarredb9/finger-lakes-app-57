import * as fs from 'fs';
import * as path from 'path';
import {
  ANCHOR_MIGRATION_VERSION,
  ADVERSARIAL_SEED_FIXTURE_PATH,
  ADVERSARIAL_VERIFY_FIXTURE_PATH,
  assertLocalEnvironment,
  resolveDockerHost,
  parseTableRows,
  extractQueryRows,
  evaluateSurvivorInvariants,
  runTwoPhaseMigrationReplay,
  type AdversarialSurvivorRow,
  type CommandExecutor,
} from '../verify-migrations';

describe('verify-migrations: configuration constants', () => {
  it('targets migration anchor immediately prior to 20261104100000', () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => /^\d{14}_.*\.sql$/.test(file))
      .sort();

    const anchorFile = migrationFiles.find((file) =>
      file.startsWith(ANCHOR_MIGRATION_VERSION)
    );
    expect(anchorFile).toBeDefined();

    const targetIndex = migrationFiles.findIndex((file) =>
      file.startsWith('20261104100000')
    );
    expect(targetIndex).toBeGreaterThan(0);
    expect(migrationFiles[targetIndex - 1]).toBe(anchorFile);
  });

  it('references existing fixture paths', () => {
    const seedPath = path.resolve(process.cwd(), ADVERSARIAL_SEED_FIXTURE_PATH);
    expect(fs.existsSync(seedPath)).toBe(true);
    expect(fs.statSync(seedPath).size).toBeGreaterThan(0);

    const verifyPath = path.resolve(process.cwd(), ADVERSARIAL_VERIFY_FIXTURE_PATH);
    expect(fs.existsSync(verifyPath)).toBe(true);
    expect(fs.statSync(verifyPath).size).toBeGreaterThan(0);
  });
});

describe('verify-migrations: resolveDockerHost', () => {
  const originalDockerHost = process.env.DOCKER_HOST;

  afterEach(() => {
    if (originalDockerHost !== undefined) {
      process.env.DOCKER_HOST = originalDockerHost;
    } else {
      delete process.env.DOCKER_HOST;
    }
  });

  it('respects explicitly configured DOCKER_HOST', () => {
    process.env.DOCKER_HOST = 'unix:///custom/docker.sock';
    expect(resolveDockerHost()).toBe('unix:///custom/docker.sock');
  });

  it('detects or returns fallback when DOCKER_HOST is unset', () => {
    delete process.env.DOCKER_HOST;
    const host = resolveDockerHost();
    expect(host === undefined || host.startsWith('unix://')).toBe(true);
  });
});

describe('verify-migrations: assertLocalEnvironment', () => {
  it('allows local loopback URLs', () => {
    expect(() => assertLocalEnvironment('http://127.0.0.1:54321')).not.toThrow();
    expect(() => assertLocalEnvironment('http://localhost:54321')).not.toThrow();
    expect(() => assertLocalEnvironment('http://0.0.0.0:54321')).not.toThrow();
  });

  it('rejects remote URLs with safety exception', () => {
    expect(() =>
      assertLocalEnvironment('https://jfsxclrdxmvftxacjuqf.supabase.co')
    ).toThrow(/Safety Guardrail Triggered/);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertLocalEnvironment('not-a-valid-url')).toThrow(/Invalid Supabase URL/);
  });
});

describe('verify-migrations: extractQueryRows', () => {
  it('extracts rows from CLI JSON output surrounded by noise (agent mode object)', () => {
    const rawOutput = `
Target: local stack (127.0.0.1:54322) · default; pass --remote for supabase-finger-lakes (jfsxclrdxmvftxacjuqf)
{
  "boundary": "test-boundary-123",
  "rows": [
    {
      "self_referential_count": 0,
      "reciprocal_pair_count": 1,
      "survivor_friend_status": "accepted",
      "lower_email_conflict_count": 1,
      "duplicate_profile_email": null
    }
  ],
  "warning": "Untrusted data."
}
A new version of Supabase CLI is available: v3.1.0
    `;

    const rows = extractQueryRows<AdversarialSurvivorRow>(rawOutput);
    expect(rows).toHaveLength(1);
    expect(rows[0].self_referential_count).toBe(0);
    expect(rows[0].reciprocal_pair_count).toBe(1);
    expect(rows[0].survivor_friend_status).toBe('accepted');
    expect(rows[0].lower_email_conflict_count).toBe(1);
    expect(rows[0].duplicate_profile_email).toBeNull();
  });

  it('extracts rows from bare JSON array returned by standard CLI with -o json', () => {
    const rawOutput = `
Target: local stack (127.0.0.1:54322)
[
  {
    "self_referential_count": 0,
    "reciprocal_pair_count": 1,
    "survivor_friend_status": "accepted",
    "lower_email_conflict_count": 1,
    "duplicate_profile_email": null
  }
]
A new version of Supabase CLI is available: v3.1.0
    `;

    const rows = extractQueryRows<AdversarialSurvivorRow>(rawOutput);
    expect(rows).toHaveLength(1);
    expect(rows[0].self_referential_count).toBe(0);
    expect(rows[0].reciprocal_pair_count).toBe(1);
    expect(rows[0].survivor_friend_status).toBe('accepted');
    expect(rows[0].lower_email_conflict_count).toBe(1);
    expect(rows[0].duplicate_profile_email).toBeNull();
  });

  it('extracts rows from Unicode ASCII table output (CI / terminal fallback)', () => {
    const rawOutput = `
┌────────────────────────┬───────────────────────┬────────────────────────┬────────────────────────────┬─────────────────────────┐
│ self_referential_count │ reciprocal_pair_count │ survivor_friend_status │ lower_email_conflict_count │ duplicate_profile_email │
├────────────────────────┼───────────────────────┼────────────────────────┼────────────────────────────┼─────────────────────────┤
│ 0                      │ 1                     │ accepted               │ 1                          │ NULL                    │
└────────────────────────┴───────────────────────┴────────────────────────┴────────────────────────────┴─────────────────────────┘
    `;

    const rows = extractQueryRows<AdversarialSurvivorRow>(rawOutput);
    expect(rows).toHaveLength(1);
    expect(rows[0].self_referential_count).toBe(0);
    expect(rows[0].reciprocal_pair_count).toBe(1);
    expect(rows[0].survivor_friend_status).toBe('accepted');
    expect(rows[0].lower_email_conflict_count).toBe(1);
    expect(rows[0].duplicate_profile_email).toBeNull();
  });

  it('throws descriptive error if no valid data is found in output', () => {
    expect(() => extractQueryRows('plain string without json or table')).toThrow(
      /Failed to extract query rows/
    );
  });
});

describe('verify-migrations: parseTableRows', () => {
  it('returns empty array when output does not contain tabular structure', () => {
    expect(parseTableRows('')).toEqual([]);
    expect(parseTableRows('single line without delimiters')).toEqual([]);
  });

  it('correctly parses data types (integers, floats, booleans, nulls, strings)', () => {
    const tableOutput = `
┌────────────┬─────────────┬─────────────┬──────────┬───────────┐
│ int_col    │ float_col   │ bool_col    │ null_col │ text_col  │
├────────────┼─────────────┼─────────────┼──────────┼───────────┤
│ 42         │ 3.14        │ true        │ NULL     │ hello     │
│ -7         │ -0.5        │ false       │ null     │ world     │
└────────────┴─────────────┴─────────────┴──────────┴───────────┘
    `;
    const parsed = parseTableRows(tableOutput);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      int_col: 42,
      float_col: 3.14,
      bool_col: true,
      null_col: null,
      text_col: 'hello',
    });
    expect(parsed[1]).toEqual({
      int_col: -7,
      float_col: -0.5,
      bool_col: false,
      null_col: null,
      text_col: 'world',
    });
  });
});

describe('verify-migrations: evaluateSurvivorInvariants', () => {
  const validRow: AdversarialSurvivorRow = {
    self_referential_count: 0,
    reciprocal_pair_count: 1,
    survivor_friend_status: 'accepted',
    lower_email_conflict_count: 1,
    duplicate_profile_email: null,
  };

  it('passes when all invariants are satisfied', () => {
    const result = evaluateSurvivorInvariants([validRow]);
    expect(result.allPassed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.checks.selfReferentialPassed).toBe(true);
    expect(result.checks.reciprocalPairPassed).toBe(true);
    expect(result.checks.deterministicPriorityPassed).toBe(true);
    expect(result.checks.emailDeduplicationPassed).toBe(true);
    expect(result.checks.emailNullSecondaryPassed).toBe(true);
  });

  it('flags self-referential rows surviving cleanup', () => {
    const result = evaluateSurvivorInvariants([
      { ...validRow, self_referential_count: 1 },
    ]);
    expect(result.allPassed).toBe(false);
    expect(result.checks.selfReferentialPassed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('Self-referential friendships survived')
    );
  });

  it('flags reciprocal duplicate pairs surviving cleanup', () => {
    const result = evaluateSurvivorInvariants([
      { ...validRow, reciprocal_pair_count: 2 },
    ]);
    expect(result.allPassed).toBe(false);
    expect(result.checks.reciprocalPairPassed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('Reciprocal friendship pair deduplication failed')
    );
  });

  it('flags non-deterministic survivor status', () => {
    const result = evaluateSurvivorInvariants([
      { ...validRow, survivor_friend_status: 'pending' },
    ]);
    expect(result.allPassed).toBe(false);
    expect(result.checks.deterministicPriorityPassed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('Deterministic priority rule failed')
    );
  });

  it('flags unresolved lower(email) conflicts', () => {
    const result = evaluateSurvivorInvariants([
      { ...validRow, lower_email_conflict_count: 2 },
    ]);
    expect(result.allPassed).toBe(false);
    expect(result.checks.emailDeduplicationPassed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('Case-insensitive email deduplication failed')
    );
  });

  it('flags duplicate profile email not being set to NULL', () => {
    const result = evaluateSurvivorInvariants([
      { ...validRow, duplicate_profile_email: 'conflictuser@example.com' },
    ]);
    expect(result.allPassed).toBe(false);
    expect(result.checks.emailNullSecondaryPassed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('Secondary duplicate profile email was not nulled')
    );
  });

  it('fails if row array is empty', () => {
    const result = evaluateSurvivorInvariants([]);
    expect(result.allPassed).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('No survivor assertion rows returned')
    );
  });
});

describe('verify-migrations: runTwoPhaseMigrationReplay orchestration', () => {
  const sampleCliJson = JSON.stringify({
    rows: [
      {
        self_referential_count: 0,
        reciprocal_pair_count: 1,
        survivor_friend_status: 'accepted',
        lower_email_conflict_count: 1,
        duplicate_profile_email: null,
      },
    ],
  });

  it('executes the 4-step replay sequence in exact order', async () => {
    const executedCommands: string[] = [];
    const mockExecutor: CommandExecutor = (cmd: string) => {
      executedCommands.push(cmd);
      if (cmd.includes('adversarial-verify.sql')) {
        return sampleCliJson;
      }
      return 'OK';
    };

    const report = await runTwoPhaseMigrationReplay({
      executor: mockExecutor,
      supabaseUrl: 'http://127.0.0.1:54321',
    });

    expect(report.allPassed).toBe(true);
    expect(executedCommands).toHaveLength(4);
    expect(executedCommands[0]).toBe(
      'npx supabase db reset --version 20261026000000 --no-seed'
    );
    expect(executedCommands[1]).toBe(
      'npx supabase db query -f scripts/db/fixtures/adversarial-seed.sql'
    );
    expect(executedCommands[2]).toBe('npx supabase migration up');
    expect(executedCommands[3]).toBe(
      'npx supabase db query -o json -f scripts/db/fixtures/adversarial-verify.sql'
    );
  });

  it('prevents execution against remote URL before any command is run', async () => {
    const executedCommands: string[] = [];
    const mockExecutor: CommandExecutor = (cmd: string) => {
      executedCommands.push(cmd);
      return 'OK';
    };

    await expect(
      runTwoPhaseMigrationReplay({
        executor: mockExecutor,
        supabaseUrl: 'https://jfsxclrdxmvftxacjuqf.supabase.co',
      })
    ).rejects.toThrow(/Safety Guardrail Triggered/);

    expect(executedCommands).toHaveLength(0);
  });

  it('captures command execution failures cleanly', async () => {
    const mockExecutor: CommandExecutor = (cmd: string) => {
      if (cmd.includes('migration up')) {
        throw new Error('Migration failed: duplicate key violates constraint');
      }
      return 'OK';
    };

    const report = await runTwoPhaseMigrationReplay({
      executor: mockExecutor,
      supabaseUrl: 'http://127.0.0.1:54321',
    });

    expect(report.allPassed).toBe(false);
    expect(report.error).toContain('Migration failed');
  });
});
