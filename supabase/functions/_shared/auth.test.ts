import { assertEquals } from "std/testing/asserts.ts";

export interface SharedAuthModule {
  constantTimeEqual: (a: string, b: string) => Promise<boolean>;
  verifyBearerSecret: (
    authHeader: string | null,
    candidateSecrets: ReadonlyArray<string | undefined | null>,
  ) => Promise<boolean>;
}

async function loadAuthModule(): Promise<SharedAuthModule> {
  const mod = await import(new URL("./auth.ts", import.meta.url).href);
  return mod as SharedAuthModule;
}

Deno.test("auth - constantTimeEqual returns true for identical ASCII and UTF-8 strings", async () => {
  const { constantTimeEqual } = await loadAuthModule();

  assertEquals(await constantTimeEqual("super-secret-token", "super-secret-token"), true);
  assertEquals(await constantTimeEqual("", ""), true);
  assertEquals(await constantTimeEqual("🔐tök€n-αβγ-123", "🔐tök€n-αβγ-123"), true);
});

Deno.test("auth - constantTimeEqual returns false for same-length and differing-length mismatches without throwing", async () => {
  const { constantTimeEqual } = await loadAuthModule();

  assertEquals(await constantTimeEqual("abcdef", "abcdeg"), false);
  assertEquals(await constantTimeEqual("secret", "secret-suffix"), false);
  assertEquals(await constantTimeEqual("secret-suffix", "secret"), false);
  assertEquals(await constantTimeEqual("", "non-empty"), false);
  assertEquals(await constantTimeEqual("non-empty", ""), false);
  assertEquals(await constantTimeEqual("secret", "secret "), false);
  assertEquals(await constantTimeEqual(" secret", "secret"), false);
});

Deno.test("auth - verifyBearerSecret rejects missing, malformed, and non-Bearer headers", async () => {
  const { verifyBearerSecret } = await loadAuthModule();
  const candidates = ["internal-secret", "webhook-secret"];

  assertEquals(await verifyBearerSecret(null, candidates), false);
  assertEquals(await verifyBearerSecret("", candidates), false);
  assertEquals(await verifyBearerSecret("Bearer", candidates), false);
  assertEquals(await verifyBearerSecret("Bearer   ", candidates), false);
  assertEquals(await verifyBearerSecret("Basic aW50ZXJuYWwtc2VjcmV0", candidates), false);
  assertEquals(await verifyBearerSecret("Token internal-secret", candidates), false);
});

Deno.test("auth - verifyBearerSecret rejects when candidateSecrets is empty or only blank values", async () => {
  const { verifyBearerSecret } = await loadAuthModule();

  assertEquals(await verifyBearerSecret("Bearer anything", []), false);
  assertEquals(await verifyBearerSecret("Bearer ", []), false);
  assertEquals(
    await verifyBearerSecret("Bearer anything", [undefined, null, "", "   ", "\t"]),
    false,
  );
  assertEquals(
    await verifyBearerSecret("Bearer    ", [undefined, null, "", "   "]),
    false,
  );
});

Deno.test("auth - verifyBearerSecret accepts matching secret in any candidate slot", async () => {
  const { verifyBearerSecret } = await loadAuthModule();
  const candidates = ["short", undefined, "medium-webhook-secret", null, "very-long-service-role-key-value"];

  assertEquals(await verifyBearerSecret("Bearer short", candidates), true);
  assertEquals(await verifyBearerSecret("Bearer medium-webhook-secret", candidates), true);
  assertEquals(await verifyBearerSecret("Bearer very-long-service-role-key-value", candidates), true);
  assertEquals(await verifyBearerSecret("Bearer  medium-webhook-secret ", candidates), true);
});

Deno.test("auth - verifyBearerSecret rejects prefix, suffix, and off-by-one mismatches", async () => {
  const { verifyBearerSecret } = await loadAuthModule();
  const candidates = ["correct-secret-1", "longer-webhook-secret-2"];

  assertEquals(await verifyBearerSecret("Bearer correct-secret-", candidates), false);
  assertEquals(await verifyBearerSecret("Bearer correct-secret-1-extra", candidates), false);
  assertEquals(await verifyBearerSecret("Bearer correct-secret-2", candidates), false);
  assertEquals(await verifyBearerSecret("Bearer longer-webhook-secret", candidates), false);
  assertEquals(await verifyBearerSecret("Bearer wrong", candidates), false);
});
