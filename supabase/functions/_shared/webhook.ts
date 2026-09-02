/**
 * Resolves the full URL for invoking an Edge Function from database triggers or webhooks.
 * Dynamically resolves from the provided base URL (e.g. from SUPABASE_URL or current_setting),
 * falling back to the local Kong gateway (http://kong:8000) when not configured.
 * Gracefully strips any trailing slashes from the base URL.
 *
 * @param functionName The name of the Edge Function (e.g. 'send-social-notification')
 * @param baseUrl The base Supabase URL or null/undefined
 * @returns The fully-qualified webhook URL
 */
export function resolveWebhookUrl(functionName: string, baseUrl?: string | null): string {
  const cleanedBase = baseUrl?.trim().replace(/\/+$/, '') || 'http://kong:8000';
  const cleanedFunction = functionName.trim().replace(/^\/+/, '');
  return `${cleanedBase}/functions/v1/${cleanedFunction}`;
}
