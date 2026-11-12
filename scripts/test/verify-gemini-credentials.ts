/* eslint-disable no-console */
/**
 * scripts/test/verify-gemini-credentials.ts
 *
 * Preflight Sanity Check for Google Gemini API Credentials.
 * Validates configured API key or OAuth token against live Generative Language API
 * using an ultra-low-latency 1-token prompt.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env from project root if present
const rootEnvPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
}

// Fallback to supabase/functions/.env if GEMINI_API_KEY not yet set
if (!process.env.GEMINI_API_KEY) {
  const edgeEnvPath = path.resolve(process.cwd(), 'supabase/functions/.env');
  if (fs.existsSync(edgeEnvPath)) {
    dotenv.config({ path: edgeEnvPath });
  }
}

async function verifyCredentials() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.error('❌ [Gemini Preflight] Error: No GEMINI_API_KEY or GOOGLE_MAPS_API_KEY found in environment or .env files.');
    process.exit(1);
  }

  function getKeyType(key: string, isOAuth: boolean): string {
    if (isOAuth) return 'OAuth 2.0 Access Token (ya29.)';
    if (key.startsWith('AQ.')) return 'Google AI Studio API Key (AQ.)';
    if (key.startsWith('AIzaSy')) return 'Google Cloud API Key (AIzaSy)';
    return 'Custom / Unknown format';
  }

  const isOAuthToken = apiKey.startsWith('ya29.');
  const keyType = getKeyType(apiKey, isOAuthToken);

  const maskedKey = apiKey.length > 8
    ? `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}`
    : '***';

  console.log(`🔍 [Gemini Preflight] Validating credentials:`);
  console.log(`   - Type:   ${keyType}`);
  console.log(`   - Key:    ${maskedKey}`);
  console.log(`   - Target: gemini-2.5-flash`);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isOAuthToken) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else {
    headers['x-goog-api-key'] = apiKey;
  }

  const payload = {
    contents: [
      {
        parts: [{ text: 'Ping. Reply with one word: Pong.' }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 5,
    },
  };

  const startTime = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const latencyMs = Date.now() - startTime;

    if (res.ok) {
      const data = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '(empty)';
      console.log(`✅ [Gemini Preflight] HTTP 200 OK (${latencyMs}ms)`);
      console.log(`   - Response: "${reply}"`);
      console.log(`   - Gemini API connection verified successfully.`);
      process.exit(0);
    }

    const errorBody = await res.text();
    console.error(`❌ [Gemini Preflight] API call failed with HTTP ${res.status} (${latencyMs}ms):`);
    console.error(`   ${errorBody}\n`);

    if (res.status === 401) {
      console.error('💡 Hint (401 Unauthorized): The API key is invalid or header format is rejected.');
      if (apiKey.startsWith('AQ.') && headers['Authorization']) {
        console.error('   Google AI Studio keys (AQ.) must be sent via "x-goog-api-key" header, not Bearer token.');
      }
    } else if (res.status === 403) {
      console.error('💡 Hint (403 Forbidden): The key does not have permission to access Generative Language API.');
      console.error('   Ensure Generative Language API is enabled in Google Cloud Console or use an AI Studio key.');
    } else if (res.status === 404) {
      console.error('💡 Hint (404 Not Found): The specified Gemini model endpoint is not found or has been retired.');
    } else if (res.status === 429) {
      console.error('💡 Hint (429 Rate Limit / Quota): Quota exhausted or rate limited.');
    }

    process.exit(1);
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    console.error(`❌ [Gemini Preflight] Network/Fetch Exception (${latencyMs}ms):`, err?.message || err);
    process.exit(1);
  }
}

verifyCredentials();
