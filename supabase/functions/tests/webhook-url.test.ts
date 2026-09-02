import { assertEquals, assertNotEquals } from "std/testing/asserts.ts";
import { resolveWebhookUrl } from "../_shared/webhook.ts";

Deno.test("resolveWebhookUrl - dynamically resolves from SUPABASE_URL without hardcoded project", () => {
  const url = resolveWebhookUrl("send-social-notification", "https://custom-project.supabase.co");
  assertEquals(url, "https://custom-project.supabase.co/functions/v1/send-social-notification");
  assertNotEquals(url.includes("jfsxclrdxmvftxacjuqf"), true);
});

Deno.test("resolveWebhookUrl - falls back to local kong when SUPABASE_URL is not set", () => {
  const url = resolveWebhookUrl("send-social-notification", null);
  assertEquals(url, "http://kong:8000/functions/v1/send-social-notification");
  assertNotEquals(url.includes("jfsxclrdxmvftxacjuqf"), true);
});

Deno.test("resolveWebhookUrl - strips trailing slashes gracefully", () => {
  const url = resolveWebhookUrl("send-social-notification", "https://custom-project.supabase.co/");
  assertEquals(url, "https://custom-project.supabase.co/functions/v1/send-social-notification");
});
