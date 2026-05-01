---
name: supabase-postgres-best-practices
description: Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations.
---

# Supabase Postgres Best Practices

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 8 categories, prioritized by impact to guide automated query optimization and schema design.

## Reference Categories

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## Available References

Reference files are named `{prefix}-{topic}.md` (e.g., `query-missing-indexes.md`). Browse `references/` for detailed documentation:

- **Query Performance**: `references/query-missing-indexes.md`, `references/query-partial-indexes.md`, `references/query-composite-indexes.md`, etc.
- **Security & RLS**: `references/security-rls-performance.md`, `references/security-rls-basics.md`, etc.
- **Connection Management**: `references/conn-pooling.md`, `references/conn-limits.md`, etc.

*30 reference files across 8 categories*

## Usage

1. Read individual rule files for detailed explanations and SQL examples.
2. Each rule file contains:
   - Brief explanation of why it matters
   - Incorrect SQL example with explanation
   - Correct SQL example with explanation
   - Optional EXPLAIN output or metrics
   - Supabase-specific notes (when applicable)
