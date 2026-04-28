import { isSupabaseUrl } from "../sw-utils";

describe("isSupabaseUrl", () => {
  const SUPABASE_URL = "http://127.0.0.1:54321";
  const BASE_URL = "http://localhost:3000";

  it("should return true for exact Supabase URL match", () => {
    const url = new URL("http://127.0.0.1:54321/rest/v1/wineries");
    expect(isSupabaseUrl(url, SUPABASE_URL, BASE_URL)).toBe(true);
  });

  it("should return true for production Supabase domain", () => {
    const url = new URL("https://xyz.supabase.co/rest/v1/wineries");
    expect(isSupabaseUrl(url, SUPABASE_URL, BASE_URL)).toBe(true);
  });

  it("should return false for app base URL", () => {
    const url = new URL("http://localhost:3000/api/auth");
    expect(isSupabaseUrl(url, SUPABASE_URL, BASE_URL)).toBe(false);
  });

  it("should return false for self origin", () => {
    const url = new URL("http://localhost:3000/some-page");
    expect(isSupabaseUrl(url, SUPABASE_URL, BASE_URL, "http://localhost:3000")).toBe(false);
  });

  it("should return true for localhost if 127.0.0.1 is configured (FAILING CASE)", () => {
    const url = new URL("http://localhost:54321/rest/v1/wineries");
    // This should be true because localhost and 127.0.0.1 are equivalent
    expect(isSupabaseUrl(url, SUPABASE_URL, BASE_URL)).toBe(true);
  });

  it("should return true for 127.0.0.1 if localhost is configured (FAILING CASE)", () => {
    const SUPABASE_URL_LOCALHOST = "http://localhost:54321";
    const url = new URL("http://127.0.0.1:54321/rest/v1/wineries");
    // This should be true because localhost and 127.0.0.1 are equivalent
    expect(isSupabaseUrl(url, SUPABASE_URL_LOCALHOST, BASE_URL)).toBe(true);
  });
});
