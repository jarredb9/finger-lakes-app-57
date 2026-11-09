import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isPostBaselineMigration,
  lintMigrationContent,
  runMigrationLinter,
} from '../lint-migrations';


describe('lint-migrations: baseline version filtering', () => {
  it('identifies squashed baseline migration as not post-baseline', () => {
    expect(isPostBaselineMigration('20260528000000_v2.11.0-stable.sql')).toBe(false);
  });

  it('identifies older migrations as not post-baseline', () => {
    expect(isPostBaselineMigration('20260527235959_legacy.sql')).toBe(false);
  });

  it('identifies newer migrations as post-baseline', () => {
    expect(
      isPostBaselineMigration('20260601000000_enable_performance_extensions.sql')
    ).toBe(true);
    expect(
      isPostBaselineMigration('20261104100000_harden_friends_and_profiles.sql')
    ).toBe(true);
  });

  it('ignores files that do not match migration timestamp pattern', () => {
    expect(isPostBaselineMigration('README.md')).toBe(false);
    expect(isPostBaselineMigration('verify-security-advisor.sql')).toBe(false);
  });

  it('skips lint checks when linting a baseline migration file', () => {
    const rawSql = `
      ALTER TABLE public.visits ADD CONSTRAINT visits_pkey PRIMARY KEY (id);
      ALTER TABLE public.friends ADD CONSTRAINT friends_user1_ne_user2 CHECK (user1_id <> user2_id);
    `;
    const result = lintMigrationContent(rawSql, '20260528000000_v2.11.0-stable.sql');
    expect(result.isPostBaseline).toBe(false);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

describe('lint-migrations: unreconciled constraint tightening detection', () => {
  const postBaselineFile = '20261104100000_test_migration.sql';

  it('flags un-reconciled CREATE UNIQUE INDEX', () => {
    const sql = `CREATE UNIQUE INDEX idx_friends_pair ON public.friends (user1_id, user2_id);`;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraintType).toBe('CREATE UNIQUE INDEX');
    expect(result.violations[0].tableName).toBe('friends');
  });

  it('flags un-reconciled ALTER TABLE ... ADD CONSTRAINT ... UNIQUE', () => {
    const sql = `ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_idempotency_key UNIQUE (user_id, idempotency_key);`;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraintType).toBe('ADD CONSTRAINT UNIQUE');
    expect(result.violations[0].tableName).toBe('visits');
  });

  it('flags un-reconciled ALTER TABLE ... ADD CONSTRAINT ... CHECK', () => {
    const sql = `ALTER TABLE public.friends ADD CONSTRAINT friends_user1_ne_user2 CHECK (user1_id <> user2_id);`;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraintType).toBe('ADD CONSTRAINT CHECK');
    expect(result.violations[0].tableName).toBe('friends');
  });

  it('flags un-reconciled ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY', () => {
    const sql = `ALTER TABLE public.friends ADD CONSTRAINT friends_user1_fkey FOREIGN KEY (user1_id) REFERENCES public.profiles(id);`;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraintType).toBe('ADD CONSTRAINT FOREIGN KEY');
    expect(result.violations[0].tableName).toBe('friends');
  });

  it('flags un-reconciled ALTER TABLE ... ALTER COLUMN ... SET NOT NULL', () => {
    const sql = `ALTER TABLE public.profiles ALTER COLUMN bio SET NOT NULL;`;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].constraintType).toBe('SET NOT NULL');
    expect(result.violations[0].tableName).toBe('profiles');
    expect(result.violations[0].columnName).toBe('bio');
  });
});

describe('lint-migrations: Condition 1 - Same-file table and column creation', () => {
  const postBaselineFile = '20261104100000_new_table_feature.sql';

  it('permits UNIQUE INDEX on a table created earlier in the same file', () => {
    const sql = `
      CREATE TABLE public.winery_awards (
        id uuid PRIMARY KEY,
        winery_id integer NOT NULL,
        award_name text NOT NULL
      );

      CREATE UNIQUE INDEX idx_winery_awards_pair ON public.winery_awards (winery_id, award_name);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('permits ADD CONSTRAINT CHECK on a table created earlier in the same file', () => {
    const sql = `
      CREATE TABLE public.winery_ratings (
        id uuid PRIMARY KEY,
        rating numeric NOT NULL
      );

      ALTER TABLE public.winery_ratings ADD CONSTRAINT check_rating_range CHECK (rating >= 0 AND rating <= 5);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('permits ADD CONSTRAINT FOREIGN KEY on a table created earlier in the same file', () => {
    const sql = `
      CREATE TABLE public.winery_photos (
        id uuid PRIMARY KEY,
        winery_id integer NOT NULL
      );

      ALTER TABLE public.winery_photos ADD CONSTRAINT winery_photos_winery_fkey FOREIGN KEY (winery_id) REFERENCES public.wineries(id);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('permits SET NOT NULL on a column added earlier in the same file on an existing table', () => {
    const sql = `
      ALTER TABLE public.profiles ADD COLUMN nickname text;
      ALTER TABLE public.profiles ALTER COLUMN nickname SET NOT NULL;
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('still flags SET NOT NULL on a column NOT added in the same file on an existing table', () => {
    const sql = `
      ALTER TABLE public.profiles ADD COLUMN nickname text;
      ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].columnName).toBe('email');
  });
});

describe('lint-migrations: Condition 2 - Reconciliation and idempotency', () => {
  const postBaselineFile = '20261104100000_reconciled_migration.sql';

  it('permits CREATE UNIQUE INDEX with preceding DELETE FROM and IF NOT EXISTS', () => {
    const sql = `
      DELETE FROM public.friends
      WHERE user1_id = user2_id;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair
        ON public.friends (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('permits CREATE UNIQUE INDEX with preceding CTE DELETE FROM and IF NOT EXISTS', () => {
    const sql = `
      WITH ranked_friends AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id) ORDER BY id) as rn
        FROM public.friends
      )
      DELETE FROM public.friends
      WHERE id IN (SELECT id FROM ranked_friends WHERE rn > 1);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_unique_pair
        ON public.friends (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id));
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('permits CREATE UNIQUE INDEX with preceding CTE UPDATE and IF NOT EXISTS', () => {
    const sql = `
      WITH ranked_profiles AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY id ASC) AS rn
        FROM public.profiles
        WHERE email IS NOT NULL
      )
      UPDATE public.profiles
      SET email = NULL
      WHERE id IN (SELECT id FROM ranked_profiles WHERE rn > 1);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_lower_email
        ON public.profiles (LOWER(email))
        WHERE email IS NOT NULL;
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('permits ADD CONSTRAINT CHECK inside DO $$ block querying pg_constraint with preceding DELETE', () => {
    const sql = `
      DELETE FROM public.friends
      WHERE user1_id = user2_id;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'friends_user1_ne_user2'
        ) THEN
          ALTER TABLE public.friends
            ADD CONSTRAINT friends_user1_ne_user2 CHECK (user1_id <> user2_id);
        END IF;
      END $$;
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('fails with missing-idempotency when preceding DELETE exists but IF NOT EXISTS is missing on CREATE UNIQUE INDEX', () => {
    const sql = `
      DELETE FROM public.friends WHERE user1_id = user2_id;

      CREATE UNIQUE INDEX idx_friends_pair
        ON public.friends (user1_id, user2_id);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].reason).toBe('missing-idempotency');
  });

  it('fails with missing-reconciliation when IF NOT EXISTS is present but preceding DELETE/UPDATE is missing', () => {
    const sql = `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair
        ON public.friends (user1_id, user2_id);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].reason).toBe('missing-reconciliation');
  });

  it('fails with missing-reconciliation when DELETE targets a different table', () => {
    const sql = `
      DELETE FROM public.wineries WHERE id = 1;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair
        ON public.friends (user1_id, user2_id);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].reason).toBe('missing-reconciliation');
    expect(result.violations[0].tableName).toBe('friends');
  });

  it('fails when reconciliation appears AFTER the constraint tightening statement', () => {
    const sql = `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_friends_pair
        ON public.friends (user1_id, user2_id);

      DELETE FROM public.friends WHERE user1_id = user2_id;
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].reason).toBe('missing-reconciliation');
  });
});

describe('lint-migrations: Condition 3 - Explicit Pragma Escape Hatch', () => {
  const postBaselineFile = '20261026000000_harden_rls_and_security_invoker_rpcs.sql';

  it('permits tightening constraint when valid inline pragma with reason is present', () => {
    const sql = `
      -- migration-lint: ignore-reconciliation (loosens global idempotency_key unique constraint to composite user_id + idempotency_key)
      ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.ignoredCount).toBe(1);
  });

  it('permits multiple consecutive annotated statements', () => {
    const sql = `
      -- migration-lint: ignore-reconciliation (loosens global idempotency_key unique constraint to composite user_id + idempotency_key)
      ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);

      -- migration-lint: ignore-reconciliation (loosens global idempotency_key unique constraint to composite user_id + idempotency_key)
      ALTER TABLE public.trips ADD CONSTRAINT trips_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.ignoredCount).toBe(2);
  });

  it('rejects pragma with empty parentheses as invalid', () => {
    const sql = `
      -- migration-lint: ignore-reconciliation ()
      ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].reason).toBe('invalid-pragma');
  });

  it('rejects pragma with whitespace-only parentheses as invalid', () => {
    const sql = `
      -- migration-lint: ignore-reconciliation (   )
      ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].reason).toBe('invalid-pragma');
  });

  it('rejects pragma missing parentheses as invalid', () => {
    const sql = `
      -- migration-lint: ignore-reconciliation
      ALTER TABLE public.visits ADD CONSTRAINT visits_user_id_idempotency_key_key UNIQUE (user_id, idempotency_key);
    `;
    const result = lintMigrationContent(sql, postBaselineFile);
    expect(result.passed).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].reason).toBe('invalid-pragma');
  });
});

describe('lint-migrations: runMigrationLinter filesystem runner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-migrations-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('scans directory and aggregates scorecard results correctly', () => {
    // 1. Baseline migration (should be skipped)
    fs.writeFileSync(
      path.join(tempDir, '20260528000000_v2.11.0-stable.sql'),
      'ALTER TABLE public.visits ADD CONSTRAINT pkey PRIMARY KEY (id);'
    );

    // 2. Passing post-baseline migration with reconciliation & IF NOT EXISTS
    fs.writeFileSync(
      path.join(tempDir, '20260601000000_valid_migration.sql'),
      `
      DELETE FROM public.friends WHERE user1_id = user2_id;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pair ON public.friends (user1_id, user2_id);
      `
    );

    // 3. Failing post-baseline migration with unreconciled constraint
    fs.writeFileSync(
      path.join(tempDir, '20260701000000_invalid_migration.sql'),
      'ALTER TABLE public.trips ADD CONSTRAINT trip_uniq UNIQUE (user_id, idempotency_key);'
    );

    const scorecard = runMigrationLinter(tempDir, { silent: true });
    expect(scorecard.totalFilesScanned).toBe(3);
    expect(scorecard.postBaselineFilesCount).toBe(2);
    expect(scorecard.totalViolations).toBe(1);
    expect(scorecard.allPassed).toBe(false);
    expect(scorecard.results[2].passed).toBe(false);
    expect(scorecard.results[2].violations[0].tableName).toBe('trips');
  });

  it('throws an error if target migrations directory does not exist', () => {
    expect(() => {
      runMigrationLinter(path.join(tempDir, 'nonexistent'), { silent: true });
    }).toThrow(/Migrations directory not found/);
  });

  it('passes on all actual repository migrations in supabase/migrations', () => {
    const repoMigrationsDir = path.resolve(__dirname, '../../../supabase/migrations');
    const scorecard = runMigrationLinter(repoMigrationsDir, { silent: true });

    expect(scorecard.allPassed).toBe(true);
    expect(scorecard.totalViolations).toBe(0);
    expect(scorecard.postBaselineFilesCount).toBeGreaterThan(0);
    expect(scorecard.totalIgnored).toBe(2);
  });
});






