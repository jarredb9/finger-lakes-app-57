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

describe("Phase 7 Task 1: Service Worker Auth Route Matching & Caching Rules", () => {
  const SUPABASE_URL = "http://127.0.0.1:54321";
  const BASE_URL = "http://localhost:3000";
  const swUtils = require("../sw-utils");

  describe("isAuthApiRoute utility", () => {
    it("should be exported as a function from sw-utils", () => {
      expect(typeof swUtils.isAuthApiRoute).toBe("function");
    });

    it("should identify Supabase auth API routes for both remote and local hosts", () => {
      const authRoutes = [
        "http://127.0.0.1:54321/auth/v1/user",
        "http://127.0.0.1:54321/auth/v1/session",
        "http://127.0.0.1:54321/auth/v1/token?grant_type=refresh_token",
        "http://127.0.0.1:54321/auth/v1/logout",
        "http://127.0.0.1:54321/auth/v1/recover",
        "https://jfsxclrdxmvftxacjuqf.supabase.co/auth/v1/user",
      ];

      for (const rawUrl of authRoutes) {
        const url = new URL(rawUrl);
        expect(swUtils.isAuthApiRoute(url, SUPABASE_URL, BASE_URL)).toBe(true);
      }
    });

    it("should reject non-auth Supabase endpoints and non-Supabase URLs", () => {
      const nonAuthRoutes = [
        "http://127.0.0.1:54321/rest/v1/wineries",
        "http://127.0.0.1:54321/storage/v1/object/public/avatars/test.jpg",
        "http://localhost:3000/api/auth/callback",
        "https://maps.googleapis.com/maps/api/place/details/json",
      ];

      for (const rawUrl of nonAuthRoutes) {
        const url = new URL(rawUrl);
        expect(swUtils.isAuthApiRoute(url, SUPABASE_URL, BASE_URL)).toBe(false);
      }
    });
  });

  describe("isAuthPageRoute utility", () => {
    it("should be exported as a function from sw-utils", () => {
      expect(typeof swUtils.isAuthPageRoute).toBe("function");
    });

    it("should identify authentication pages that must be excluded from pages cache", () => {
      const authPaths = [
        "/login",
        "/login?redirectTo=/trips",
        "/signup",
        "/forgot-password",
        "/manual-confirm",
        "/manual-confirm?email=test@example.com",
      ];

      for (const path of authPaths) {
        expect(swUtils.isAuthPageRoute(path)).toBe(true);
      }
    });

    it("should return false for non-auth application routes", () => {
      const nonAuthPaths = [
        "/",
        "/trips",
        "/trips/123",
        "/friends",
        "/friends/456",
        "/settings",
        "/privacy",
        "/terms",
      ];

      for (const path of nonAuthPaths) {
        expect(swUtils.isAuthPageRoute(path)).toBe(false);
      }
    });
  });
});

