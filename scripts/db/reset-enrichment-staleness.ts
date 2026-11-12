/* eslint-disable no-console */
/**
 * scripts/db/reset-enrichment-staleness.ts
 *
 * Resets enrichment staleness and clears fallback boilerplate AI summaries (Option A)
 * in public.wineries.
 *
 * Guardrail: Prohibits execution against remote Supabase projects without explicit
 * directive and secondary confirmation turn (AGENTS.md Section 2).
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { Client, type ClientConfig } from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getPgClientConfig(connectionString: string): ClientConfig {
  try {
    const url = new URL(connectionString);
    const hostname = url.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    const sslMode = url.searchParams.get('sslmode');

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

async function runReset() {
  const dbUrl =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

  let hostname = 'unknown';
  try {
    hostname = new URL(dbUrl).hostname;
  } catch {
    hostname = 'invalid-url';
  }

  const isLocal = ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
  const allowRemote =
    process.argv.includes('--allow-remote') &&
    process.env.ALLOW_REMOTE_DB_MUTATION === 'true';

  if (!isLocal && !allowRemote) {
    console.error(
      `🚨 [AGENTS.md GUARDRAIL] Execution against remote database (${hostname}) is prohibited.`
    );
    console.error(
      '   Per AGENTS.md Critical Guardrail #1, remote mutations require explicit directive and secondary confirmation.'
    );
    console.error(
      '   To execute against remote, user must provide explicit approval, set ALLOW_REMOTE_DB_MUTATION=true, and pass --allow-remote.'
    );
    process.exit(1);
  }

  console.log(`🔌 Connecting to database at ${hostname}...`);
  const config = getPgClientConfig(dbUrl);
  const client = new Client(config);

  await client.connect();

  try {
    console.log('🔄 Executing Option A enrichment staleness reset on public.wineries...');

    const resetSql = `
      UPDATE public.wineries
      SET 
        last_enriched_at = NULL,
        generative_summary = CASE 
          WHEN generative_summary->'overview'->>'text' LIKE '%known for its distinctive wines and scenic setting%' 
          THEN NULL 
          ELSE generative_summary 
        END;
    `;

    const res = await client.query(resetSql);
    console.log(`✅ Successfully updated ${res.rowCount} wineries.`);

    // Inspect current summary / enrichment status
    const statsRes = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE last_enriched_at IS NULL) as unenriched,
        COUNT(*) FILTER (WHERE generative_summary IS NULL) as null_summary,
        COUNT(*) FILTER (WHERE generative_summary IS NOT NULL) as has_summary
      FROM public.wineries;
    `);

    const stats = statsRes.rows[0];
    console.log('📊 Post-reset Winery Summary Statistics:');
    console.log(`   - Total Wineries:              ${stats.total}`);
    console.log(`   - Unenriched (last_enriched_at NULL): ${stats.unenriched}`);
    console.log(`   - Null Summary:                ${stats.null_summary}`);
    console.log(`   - Preserved Genuine Summaries: ${stats.has_summary}`);
  } catch (err: any) {
    console.error('❌ Error executing reset query:', err?.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runReset();
