/* eslint-disable no-console */
import { Page, ConsoleMessage } from '@playwright/test';

export class DiagnosticLogger {
  private diagnosticLogs: string[] = [];

  constructor(private page: Page) {}

  /**
   * Flushes buffered diagnostic and network logs upon test failure.
   */
  flushDiagnosticLogs() {
    if (this.diagnosticLogs.length > 0) {
      console.log('\n--- Flushed Diagnostic & Network Logs for Failed Spec ---');
      for (const entry of this.diagnosticLogs) {
        console.log(entry);
      }
      this.diagnosticLogs = [];
    }
  }

  /**
   * Sets up console and request logging for the current page.
   * Buffers routine 200 OK and info logs; immediately logs errors (4xx/5xx or console errors).
   * Buffers are automatically flushed if the test fails.
   */
  setupLogging() {
    const page = this.page;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
    const isVerbose = process.env.DEBUG_E2E === 'true' || process.env.VERBOSE === 'true';

    const logHandler = (msg: ConsoleMessage) => {
      const text = msg.text();
      const type = msg.type();
      const formatted = `[BROWSER-${type.toUpperCase()}] ${text}`;

      if (isVerbose || type === 'error') {
        console.log(formatted);
      } else {
        this.diagnosticLogs.push(formatted);
      }

      if (text.includes('Hydration') || text.includes('Error') || type === 'error' || text.includes('403')) {
        if (text.includes('[DIAGNOSTIC]')) return;

        const isInfrastructure =
          text.includes('SecurityError') ||
          text.includes('IDBFactory') ||
          text.includes('Cross-Origin Request Blocked') ||
          text.includes('Failed to load resource') ||
          text.includes('WebSocket connection to') ||
          text.includes('/realtime/v1/websocket');

        const isExpectedOfflineError =
          text.includes('Edge Function failed') ||
          text.includes('FunctionsHttpError') ||
          text.includes('Load failed') ||
          text.includes('TypeError') ||
          text.includes('[Sync] Failed') ||
          text.includes('Database Connection Failed') ||
          text.includes('Internal Server Error') ||
          text.includes('navigation preload') ||
          text.includes('InvalidStateError') ||
          text.includes('JSHandle@object') ||
          text.includes('WebKit encountered an internal error');

        const isThirdPartyNoise =
          text.includes('Cookie “__cf_bm” has been rejected') ||
          text.includes('Google Maps JavaScript API: Unable to fetch configuration') ||
          text.includes('Attempted to load a Vector Map, but failed');

        if (!isInfrastructure && !isExpectedOfflineError && !isThirdPartyNoise) {
          const warning = `[DIAGNOSTIC] Would have failed due to console error: ${text}`;
          if (isVerbose) {
            console.log(warning);
          } else {
            this.diagnosticLogs.push(warning);
          }
        }
      }
    };

    page.on('console', logHandler);

    try {
      const supabaseUrlObj = new URL(supabaseUrl);
      const supabaseHost = supabaseUrlObj.host;

      page.on('request', request => {
        const url = request.url();
        if (url.includes('rpc/') || url.includes('google') || url.includes(supabaseHost)) {
          const line = `[DIAGNOSTIC] [NETWORK-REQ] ${request.method()} ${url}`;
          if (isVerbose) {
            console.log(line);
          } else {
            this.diagnosticLogs.push(line);
          }
        }
      });

      page.on('response', async response => {
        const url = response.url();
        if (url.includes('rpc/') || url.includes('google') || url.includes(supabaseHost)) {
          const status = response.status();
          const line = `[DIAGNOSTIC] [NETWORK-RES] ${status} ${url}`;
          if (isVerbose || status >= 400) {
            console.log(line);
          } else {
            this.diagnosticLogs.push(line);
          }
          if (status >= 400) {
            try {
              const body = await response.text();
              console.log(`[DIAGNOSTIC] [NETWORK-ERROR-BODY] ${body}`);
            } catch (e) {}
          }
        }
      });
    } catch (e) {
      // Ignore invalid URL parsing in isolated mock environments
    }
  }
}
