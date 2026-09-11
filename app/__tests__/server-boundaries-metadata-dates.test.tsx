import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";
import { updateSession } from "@/utils/supabase/auth-helper";

jest.mock("@/utils/supabase/auth-helper", () => {
  const actual = jest.requireActual("@/utils/supabase/auth-helper");
  return {
    ...actual,
    updateSession: jest.fn(),
  };
});

const ROOT_DIR = process.cwd();

describe("Server Component Boundaries, Route Metadata & Deterministic Dates (Phase 4 Task 1)", () => {
  const mockUpdateSession = updateSession as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Requirement 1: app/friends/[id]/page.tsx Server Component & Route Metadata", () => {
    const friendPagePath = path.join(ROOT_DIR, "app/friends/[id]/page.tsx");

    it("asserts app/friends/[id]/page.tsx exists and is not marked as a client component", () => {
      expect(fs.existsSync(friendPagePath)).toBe(true);
      const content = fs.readFileSync(friendPagePath, "utf8");

      expect(content).not.toMatch(/['"]use client['"]/);
    });

    it("asserts app/friends/[id]/page.tsx exports static Metadata", () => {
      const content = fs.readFileSync(friendPagePath, "utf8");

      expect(content).toMatch(/export\s+const\s+metadata(?::\s*Metadata)?\s*=/);
      expect(content).toMatch(/Friend Profile/);
    });

    it("asserts app/friends/[id]/page.tsx performs server-side auth check and redirects unauthenticated users", () => {
      const content = fs.readFileSync(friendPagePath, "utf8");

      // Server component must be async, import redirect from next/navigation, and check user authentication
      expect(content).toMatch(/export\s+default\s+async\s+function/);
      expect(content).toMatch(/redirect\s*\(/);
      expect(content).toMatch(/redirectTo=/);
    });
  });

  describe("Requirement 2: Auth Pages Server Component Boundaries & Metadata", () => {
    const forgotPasswordPath = path.join(ROOT_DIR, "app/forgot-password/page.tsx");
    const manualConfirmPath = path.join(ROOT_DIR, "app/manual-confirm/page.tsx");

    it("asserts app/forgot-password/page.tsx is a Server Component exporting static Metadata", () => {
      expect(fs.existsSync(forgotPasswordPath)).toBe(true);
      const content = fs.readFileSync(forgotPasswordPath, "utf8");

      expect(content).not.toMatch(/['"]use client['"]/);
      expect(content).toMatch(/export\s+const\s+metadata(?::\s*Metadata)?\s*=/);
      expect(content).toMatch(/Forgot Password/);
      expect(content).toMatch(/ForgotPasswordForm/);
    });

    it("asserts app/manual-confirm/page.tsx is a Server Component exporting static Metadata", () => {
      expect(fs.existsSync(manualConfirmPath)).toBe(true);
      const content = fs.readFileSync(manualConfirmPath, "utf8");

      expect(content).not.toMatch(/['"]use client['"]/);
      expect(content).toMatch(/export\s+const\s+metadata(?::\s*Metadata)?\s*=/);
      expect(content).toMatch(/Manual Confirmation|Manual Account Confirmation/);
      expect(content).toMatch(/ManualConfirmForm/);
    });
  });

  describe("Requirement 3: Proxy Whitelisting & Query Parameter Preservation", () => {
    it("allows unauthenticated access to /manual-confirm without redirecting to /login", async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL("https://example.com/manual-confirm"));
      const result = await proxy(request);

      expect(result.status).toBe(200);
      expect(result.headers.get("location")).toBeNull();
    });

    it("preserves query parameters in redirectTo when redirecting unauthenticated requests", async () => {
      const mockResponse = NextResponse.next();
      mockUpdateSession.mockResolvedValue({
        response: mockResponse,
        user: null,
      });

      const request = new NextRequest(new URL("https://example.com/trips?filter=upcoming&sort=date"));
      const result = await proxy(request);

      expect(result.status).toBe(307);
      const location = result.headers.get("location");
      expect(location).not.toBeNull();

      const redirectUrl = new URL(location!);
      expect(redirectUrl.pathname).toBe("/login");
      expect(redirectUrl.searchParams.get("redirectTo")).toBe("/trips?filter=upcoming&sort=date");
    });
  });

  describe("Requirement 4: Middleware Cookie Forwarding in auth-helper.ts", () => {
    const authHelperPath = path.join(ROOT_DIR, "utils/supabase/auth-helper.ts");

    it("asserts utils/supabase/auth-helper.ts forwards request object with cookies to NextResponse.next", () => {
      expect(fs.existsSync(authHelperPath)).toBe(true);
      const content = fs.readFileSync(authHelperPath, "utf8");

      // In setAll, NextResponse.next must receive the modified request ({ request })
      // rather than recreating request with only headers ({ request: { headers: request.headers } })
      expect(content).toMatch(/response\s*=\s*NextResponse\.next\(\s*\{\s*request\s*\}\s*\)/);
      expect(content).not.toMatch(/response\s*=\s*NextResponse\.next\(\s*\{\s*request:\s*\{\s*headers:\s*request\.headers\s*\}\s*\}\s*\)/);
    });
  });

  describe("Requirement 5: SSR Deterministic Dates (app/privacy & app/terms)", () => {
    const privacyPath = path.join(ROOT_DIR, "app/privacy/page.tsx");
    const termsPath = path.join(ROOT_DIR, "app/terms/page.tsx");

    it("asserts app/privacy/page.tsx uses static date constant and eliminates new Date().toLocaleDateString()", () => {
      expect(fs.existsSync(privacyPath)).toBe(true);
      const content = fs.readFileSync(privacyPath, "utf8");

      expect(content).not.toMatch(/new\s+Date\(\)\.toLocaleDateString\(\)/);
      expect(content).toMatch(/January 15, 2025/);
    });

    it("asserts app/terms/page.tsx uses static date constant and eliminates new Date().toLocaleDateString()", () => {
      expect(fs.existsSync(termsPath)).toBe(true);
      const content = fs.readFileSync(termsPath, "utf8");

      expect(content).not.toMatch(/new\s+Date\(\)\.toLocaleDateString\(\)/);
      expect(content).toMatch(/January 15, 2025/);
    });
  });

  describe("Requirement 6: Form Date Standardization (components/VisitForm.tsx)", () => {
    const visitFormPath = path.join(ROOT_DIR, "components/VisitForm.tsx");

    it("asserts components/VisitForm.tsx imports and uses getTodayLocal from @/lib/utils", () => {
      expect(fs.existsSync(visitFormPath)).toBe(true);
      const content = fs.readFileSync(visitFormPath, "utf8");

      expect(content).toMatch(/import\s*\{[^}]*getTodayLocal[^}]*\}\s*from\s*['"]@\/lib\/utils['"]/);
      expect(content).not.toMatch(/new\s+Date\(\)\.toISOString\(\)\.split\(["']T["']\)\[0\]/);
    });

    it("asserts components/VisitForm.tsx preserves editingVisit.visit_date directly without UTC re-serialization", () => {
      const content = fs.readFileSync(visitFormPath, "utf8");

      // In useEffect for editingVisit, must assign editingVisit.visit_date directly
      expect(content).toMatch(/setVisitDate\(\s*editingVisit\.visit_date\s*\)/);
      expect(content).not.toMatch(/setVisitDate\(\s*new\s+Date\(\s*editingVisit\.visit_date/);
    });
  });
});
