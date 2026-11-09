/**
 * scripts/db/lint-migrations.ts
 *
 * Static migration reconciliation and idempotency linter (Layer 1).
 * ADR Reference: docs/adr/0014-multi-phase-migration-verification-and-reconciliation-policy.md
 *
 * Verifies that all post-baseline migrations tightening constraints (UNIQUE, CHECK,
 * FOREIGN KEY, SET NOT NULL) on existing tables:
 * 1. Operate on a table or column created earlier in the same migration file, OR
 * 2. Precede the DDL with an idempotent data reconciliation statement (DELETE/UPDATE)
 *    and an idempotency guard (IF NOT EXISTS or DO $$ ... pg_constraint block), OR
 * 3. Have an explicit inline pragma escape hatch:
 *    -- migration-lint: ignore-reconciliation (<reason>)
 */

import * as fs from 'fs';
import * as path from 'path';

export const BASELINE_VERSION = '20260528000000';

export const BASELINE_MIGRATION_FILE = '20260528000000_v2.11.0-stable.sql';

export type TighteningPatternType =
  | 'CREATE UNIQUE INDEX'
  | 'ADD CONSTRAINT UNIQUE'
  | 'ADD CONSTRAINT CHECK'
  | 'ADD CONSTRAINT FOREIGN KEY'
  | 'SET NOT NULL';

export type LintViolationReason =
  | 'missing-reconciliation'
  | 'missing-idempotency'
  | 'missing-reconciliation-and-idempotency'
  | 'invalid-pragma';

export interface LintViolation {
  filePath: string;
  lineNumber: number;
  statement: string;
  tableName: string;
  columnName?: string;
  constraintType: TighteningPatternType;
  reason: LintViolationReason;
  message: string;
}

export interface MigrationLintResult {
  filePath: string;
  fileName: string;
  version: string;
  isPostBaseline: boolean;
  totalStatementsChecked: number;
  violations: LintViolation[];
  ignoredCount: number;
  passed: boolean;
}

export interface LintMigrationsScorecard {
  timestamp: string;
  totalFilesScanned: number;
  postBaselineFilesCount: number;
  totalViolations: number;
  totalIgnored: number;
  allPassed: boolean;
  results: MigrationLintResult[];
}

/**
 * Checks if a filename corresponds to a post-baseline migration.
 */
export function isPostBaselineMigration(fileName: string): boolean {
  const match = path.basename(fileName).match(/^(\d{14})_.*\.sql$/);
  if (!match) return false;
  const version = match[1];
  return version > BASELINE_VERSION;
}

/**
 * Extracts version timestamp from migration filename if valid.
 */
export function extractMigrationVersion(fileName: string): string | null {
  const match = path.basename(fileName).match(/^(\d{14})_.*\.sql$/);
  return match ? match[1] : null;
}

/**
 * Normalizes an identifier (table name, column name) by stripping quotes,
 * schema prefixes (e.g. public.), and converting to lowercase.
 */
export function normalizeIdentifier(ident: string): string {
  if (!ident) return '';
  let cleaned = ident.trim();
  cleaned = cleaned.replace(/^\((.*)\)$/, '$1').trim();
  const parts = cleaned.split('.').map((p) => p.replace(/"/g, '').trim().toLowerCase());
  if (parts.length === 2 && parts[0] === 'public') {
    return parts[1];
  }
  return parts[parts.length - 1];
}

interface TableCreation {
  table: string;
  lineNumber: number;
}

interface ColumnAddition {
  table: string;
  column: string;
  lineNumber: number;
}

interface TableReconciliation {
  table: string;
  type: 'DELETE' | 'UPDATE';
  lineNumber: number;
}

interface PragmaComment {
  raw: string;
  reason?: string;
  isValid: boolean;
  lineNumber: number;
}

interface RawStatement {
  text: string;
  startLine: number;
  endLine: number;
  isDoBlock: boolean;
  isFunctionBody: boolean;
  pragmas: PragmaComment[];
}

/**
 * Splits SQL content into distinct statements, tracking line numbers,
 * DO blocks, function bodies, and pragma comments.
 */
function parseStatements(sqlContent: string): {
  statements: RawStatement[];
  allPragmas: PragmaComment[];
} {
  const lines = sqlContent.split('\n');
  const statements: RawStatement[] = [];
  const allPragmas: PragmaComment[] = [];

  let currentStatementLines: string[] = [];
  let statementStartLine = 1;
  let inDollarQuote = false;
  let dollarTag = '';
  let isDoBlock = false;
  let isFunctionBody = false;
  let recentPragmas: PragmaComment[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];

    // Check for pragma comment on this line
    const pragmaMatch = line.match(/--\s*migration-lint:\s*ignore-reconciliation(?:\s*\(([^)]*)\))?/i);
    if (pragmaMatch) {
      const reason = pragmaMatch[1] ? pragmaMatch[1].trim() : undefined;
      const isValid = Boolean(reason && reason.length > 0);
      const pragma: PragmaComment = {
        raw: pragmaMatch[0],
        reason,
        isValid,
        lineNumber,
      };
      recentPragmas.push(pragma);
      allPragmas.push(pragma);
    }

    // Strip single line comments unless we need them
    // (Note: inside dollar-quotes, line comments are part of the body)
    if (!inDollarQuote) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--') || trimmed === '') {
        // Comment or empty line outside of statement
        if (currentStatementLines.length === 0) {
          continue;
        }
      }
    }

    if (currentStatementLines.length === 0) {
      statementStartLine = lineNumber;
    }
    currentStatementLines.push(line);

    const fullCurrentText = currentStatementLines.join('\n');

    // Dollar quote state tracking
    if (!inDollarQuote) {
      // Check if entering a dollar quote: $$ or $tag$
      const dqMatch = line.match(/\$([a-zA-Z0-9_]*)\$/);
      if (dqMatch) {
        inDollarQuote = true;
        dollarTag = dqMatch[0]; // e.g. '$$' or '$func$'
        if (/\bDO\b/i.test(fullCurrentText)) {
          isDoBlock = true;
        } else if (/\bFUNCTION\b/i.test(fullCurrentText)) {
          isFunctionBody = true;
        }
      }
    } else {
      // Check if exiting dollar quote
      // Only matches if closing dollarTag appears on this line after opening
      if (line.includes(dollarTag)) {
        // Count occurrences on this line if start and end are on the same line
        inDollarQuote = false;
      }
    }

    // Statement termination: outside of dollar quotes, a semicolon ends the statement
    if (!inDollarQuote) {
      // Remove trailing comments before checking semicolon
      const codeOnly = line.replace(/--.*$/, '').trim();
      if (codeOnly.endsWith(';')) {
        statements.push({
          text: fullCurrentText,
          startLine: statementStartLine,
          endLine: lineNumber,
          isDoBlock,
          isFunctionBody,
          pragmas: [...recentPragmas],
        });
        currentStatementLines = [];
        recentPragmas = [];
        isDoBlock = false;
        isFunctionBody = false;
      }
    }
  }

  // Any remaining unterminated statement
  if (currentStatementLines.length > 0) {
    statements.push({
      text: currentStatementLines.join('\n'),
      startLine: statementStartLine,
      endLine: lines.length,
      isDoBlock,
      isFunctionBody,
      pragmas: [...recentPragmas],
    });
  }

  return { statements, allPragmas };
}

/**
 * Lints the raw SQL content of a migration file.
 */
export function lintMigrationContent(
  sqlContent: string,
  filePath: string = 'inline.sql'
): MigrationLintResult {
  const fileName = path.basename(filePath);
  const version = extractMigrationVersion(fileName) || 'unknown';
  const isPostBaseline = version > BASELINE_VERSION;

  if (!isPostBaseline) {
    return {
      filePath,
      fileName,
      version,
      isPostBaseline: false,
      totalStatementsChecked: 0,
      violations: [],
      ignoredCount: 0,
      passed: true,
    };
  }

  const { statements } = parseStatements(sqlContent);

  const createdTables: TableCreation[] = [];
  const addedColumns: ColumnAddition[] = [];
  const reconciledTables: TableReconciliation[] = [];

  const violations: LintViolation[] = [];
  let ignoredCount = 0;
  let totalStatementsChecked = 0;

  // First pass: collect table creations, column additions, and data reconciliations
  for (const stmt of statements) {
    // Ignore bodies of CREATE FUNCTION (they do not execute at migration time)
    if (stmt.isFunctionBody) {
      continue;
    }

    const text = stmt.text;

    // Check table creation: CREATE TABLE [IF NOT EXISTS] <name>
    const createTableMatches = text.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/gi);
    for (const match of createTableMatches) {
      const table = normalizeIdentifier(match[1]);
      createdTables.push({ table, lineNumber: stmt.startLine });
    }

    // Check column additions: ALTER TABLE <tbl> ADD [COLUMN] [IF NOT EXISTS] <col>
    const alterTableAddColumnMatches = text.matchAll(
      /\bALTER\s+TABLE\s+(?:ONLY\s+)?([^\s]+)\s+[\s\S]*?\bADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_"]+)/gi
    );
    for (const match of alterTableAddColumnMatches) {
      const table = normalizeIdentifier(match[1]);
      const column = normalizeIdentifier(match[2]);
      addedColumns.push({ table, column, lineNumber: stmt.startLine });
    }

    // Check data reconciliation: DELETE FROM [ONLY] <tbl>
    const deleteMatches = text.matchAll(/\bDELETE\s+FROM\s+(?:ONLY\s+)?([^\s(;]+)/gi);
    for (const match of deleteMatches) {
      const table = normalizeIdentifier(match[1]);
      reconciledTables.push({ table, type: 'DELETE', lineNumber: stmt.startLine });
    }

    // Check data reconciliation: UPDATE [ONLY] <tbl> ... SET
    const updateMatches = text.matchAll(
      /\bUPDATE\s+(?:ONLY\s+)?([^\s(;]+)(?:\s+(?:AS\s+)?[a-zA-Z0-9_"]+)?\s+SET\b/gi
    );
    for (const match of updateMatches) {
      const table = normalizeIdentifier(match[1]);
      reconciledTables.push({ table, type: 'UPDATE', lineNumber: stmt.startLine });
    }
  }

  // Second pass: inspect statements for constraint tightening
  for (const stmt of statements) {
    if (stmt.isFunctionBody) {
      continue;
    }

    const text = stmt.text;

    // Detect CREATE UNIQUE INDEX
    const uniqueIndexMatches = text.matchAll(
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?UNIQUE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([^\s]+)?\s+ON\s+([^\s(]+)/gi
    );
    for (const match of uniqueIndexMatches) {
      totalStatementsChecked++;
      const tableName = normalizeIdentifier(match[2]);
      const rawStmtSnippet = match[0];
      const hasIdempotencyGuard = /\bIF\s+NOT\s+EXISTS\b/i.test(match[0]);

      checkStatement({
        type: 'CREATE UNIQUE INDEX',
        tableName,
        lineNumber: stmt.startLine,
        statementSnippet: rawStmtSnippet,
        hasIdempotencyGuard,
        stmt,
      });
    }

    // Detect ALTER TABLE ... ADD CONSTRAINT
    // Patterns: UNIQUE, CHECK, FOREIGN KEY
    const alterTableConstraintMatches = text.matchAll(
      /\bALTER\s+TABLE\s+(?:ONLY\s+)?([^\s]+)\s+[\s\S]*?\bADD\s+CONSTRAINT\s+([a-zA-Z0-9_"]+)?\s+(UNIQUE|CHECK|FOREIGN\s+KEY)/gi
    );
    for (const match of alterTableConstraintMatches) {
      totalStatementsChecked++;
      const tableName = normalizeIdentifier(match[1]);
      const constraintKind = match[3].toUpperCase().replace(/\s+/, ' ');
      let type: TighteningPatternType;
      if (constraintKind === 'UNIQUE') type = 'ADD CONSTRAINT UNIQUE';
      else if (constraintKind === 'CHECK') type = 'ADD CONSTRAINT CHECK';
      else type = 'ADD CONSTRAINT FOREIGN KEY';

      // Idempotency guard for ADD CONSTRAINT:
      // Either DO $$ ... pg_constraint ... OR IF NOT EXISTS
      const hasIdempotencyGuard =
        /\bIF\s+NOT\s+EXISTS\b/i.test(text) ||
        (stmt.isDoBlock && /\bpg_constraint\b/i.test(text));

      checkStatement({
        type,
        tableName,
        lineNumber: stmt.startLine,
        statementSnippet: match[0],
        hasIdempotencyGuard,
        stmt,
      });
    }

    // Detect ALTER TABLE ... ALTER COLUMN ... SET NOT NULL
    const setNotNullMatches = text.matchAll(
      /\bALTER\s+TABLE\s+(?:ONLY\s+)?([^\s]+)\s+[\s\S]*?\bALTER\s+(?:COLUMN\s+)?([a-zA-Z0-9_"]+)\s+SET\s+NOT\s+NULL/gi
    );
    for (const match of setNotNullMatches) {
      totalStatementsChecked++;
      const tableName = normalizeIdentifier(match[1]);
      const columnName = normalizeIdentifier(match[2]);

      const hasIdempotencyGuard =
        stmt.isDoBlock &&
        (/\bpg_attribute\b/i.test(text) ||
          /\binformation_schema\b/i.test(text) ||
          /\bIF\s+NOT\s+EXISTS\b/i.test(text));

      checkStatement({
        type: 'SET NOT NULL',
        tableName,
        columnName,
        lineNumber: stmt.startLine,
        statementSnippet: match[0],
        hasIdempotencyGuard,
        stmt,
      });
    }
  }

  function checkStatement(params: {
    type: TighteningPatternType;
    tableName: string;
    columnName?: string;
    lineNumber: number;
    statementSnippet: string;
    hasIdempotencyGuard: boolean;
    stmt: RawStatement;
  }) {
    const { type, tableName, columnName, lineNumber, statementSnippet, hasIdempotencyGuard, stmt } = params;

    // Condition 1: Same-file creation
    // Check if target table was created earlier in the same file
    const tableCreatedEarlier = createdTables.some(
      (c) => c.table === tableName && c.lineNumber <= lineNumber
    );
    if (tableCreatedEarlier) {
      return; // Passes!
    }

    // Check if column was added earlier in the same file (for SET NOT NULL)
    if (type === 'SET NOT NULL' && columnName) {
      const columnAddedEarlier = addedColumns.some(
        (c) => c.table === tableName && c.column === columnName && c.lineNumber <= lineNumber
      );
      if (columnAddedEarlier) {
        return; // Passes!
      }
    }

    // Condition 3: Explicit Pragma Escape Hatch
    // Check if preceded by -- migration-lint: ignore-reconciliation (<reason>)
    if (stmt.pragmas.length > 0) {
      const lastPragma = stmt.pragmas[stmt.pragmas.length - 1];
      if (lastPragma.isValid) {
        ignoredCount++;
        return; // Passes!
      } else {
        // Pragma present but invalid (e.g. empty reason)
        violations.push({
          filePath,
          lineNumber,
          statement: statementSnippet,
          tableName,
          columnName,
          constraintType: type,
          reason: 'invalid-pragma',
          message: `Pragma '-- migration-lint: ignore-reconciliation' requires a non-empty reason in parentheses.`,
        });
        return;
      }
    }

    // Condition 2: Reconciled & Idempotent
    const hasReconciliation = reconciledTables.some(
      (r) => r.table === tableName && r.lineNumber <= lineNumber
    );

    if (hasReconciliation && hasIdempotencyGuard) {
      return; // Passes!
    }

    // Determine violation reason
    let reason: LintViolationReason;
    let message: string;

    if (!hasReconciliation && !hasIdempotencyGuard) {
      reason = 'missing-reconciliation-and-idempotency';
      message = `Table '${tableName}' has constraint tightening '${type}' without preceding data reconciliation (DELETE/UPDATE) and without an idempotency guard (IF NOT EXISTS or DO $$ ... pg_constraint).`;
    } else if (!hasReconciliation) {
      reason = 'missing-reconciliation';
      message = `Table '${tableName}' has constraint tightening '${type}' with an idempotency guard, but lacks preceding data reconciliation (DELETE/UPDATE) on table '${tableName}'.`;
    } else {
      reason = 'missing-idempotency';
      message = `Table '${tableName}' has data reconciliation, but constraint tightening '${type}' lacks an idempotency guard (IF NOT EXISTS or DO $$ ... pg_constraint).`;
    }

    violations.push({
      filePath,
      lineNumber,
      statement: statementSnippet,
      tableName,
      columnName,
      constraintType: type,
      reason,
      message,
    });
  }

  return {
    filePath,
    fileName,
    version,
    isPostBaseline: true,
    totalStatementsChecked,
    violations,
    ignoredCount,
    passed: violations.length === 0,
  };
}

/**
 * Runs the static migration reconciliation linter across all migrations in the target directory.
 */
export function runMigrationLinter(
  migrationsDir: string = path.resolve(process.cwd(), 'supabase/migrations'),
  options: { silent?: boolean } = {}
): LintMigrationsScorecard {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .sort();

  const results: MigrationLintResult[] = [];
  let postBaselineCount = 0;
  let totalViolations = 0;
  let totalIgnored = 0;

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');
    const result = lintMigrationContent(content, fullPath);

    results.push(result);
    if (result.isPostBaseline) {
      postBaselineCount++;
      totalViolations += result.violations.length;
      totalIgnored += result.ignoredCount;
    }
  }

  const allPassed = totalViolations === 0;

  const scorecard: LintMigrationsScorecard = {
    timestamp: new Date().toISOString(),
    totalFilesScanned: files.length,
    postBaselineFilesCount: postBaselineCount,
    totalViolations,
    totalIgnored,
    allPassed,
    results,
  };

  if (!options.silent) {
    printScorecard(scorecard);
  }

  return scorecard;
}

/**
 * Pretty-prints the migration lint scorecard to the console.
 */
export function printScorecard(scorecard: LintMigrationsScorecard): void {
  console.log('\n================================================================================');
  console.log('              STATIC MIGRATION RECONCILIATION & IDEMPOTENCY LINTER              ');
  console.log('================================================================================');
  console.log(`Timestamp:             ${scorecard.timestamp}`);
  console.log(`Total Migrations:      ${scorecard.totalFilesScanned}`);
  console.log(`Post-Baseline Scanned: ${scorecard.postBaselineFilesCount}`);
  console.log(`Exemptions (Pragma):   ${scorecard.totalIgnored}`);
  console.log(`Total Violations:      ${scorecard.totalViolations}`);
  console.log('--------------------------------------------------------------------------------');

  if (scorecard.allPassed) {
    console.log(
      `\x1b[32m✔ PASS: All ${scorecard.postBaselineFilesCount} post-baseline migrations satisfy reconciliation and idempotency invariants.\x1b[0m`
    );
    console.log('================================================================================\n');
    return;
  }

  console.log(`\x1b[31m✖ FAIL: Found ${scorecard.totalViolations} constraint-tightening violation(s):\x1b[0m\n`);

  for (const res of scorecard.results) {
    if (!res.passed) {
      console.log(`\x1b[1m📁 ${res.fileName}\x1b[0m`);
      for (const v of res.violations) {
        console.log(`  \x1b[31m[Line ${v.lineNumber}]\x1b[0m \x1b[33m${v.constraintType}\x1b[0m on table \x1b[36m'${v.tableName}'\x1b[0m`);
        console.log(`    Reason: ${v.reason}`);
        console.log(`    Detail: ${v.message}`);
        console.log(`    Statement: ${v.statement.replace(/\s+/g, ' ').slice(0, 100)}...`);
      }
      console.log('');
    }
  }
  console.log('================================================================================\n');
}

// Standalone execution entrypoint
const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).endsWith('scripts/db/lint-migrations.ts');

if (isMain) {

  try {
    const scorecard = runMigrationLinter();
    if (!scorecard.allPassed) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('Fatal error during migration linting:', err);
    process.exit(1);
  }
}


