import { loginAction, forgotPasswordAction, manualConfirmAction } from "../auth";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/utils/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn().mockResolvedValue({
    get: (key: string) => {
      if (key === "host") return "localhost:3000";
      if (key === "x-forwarded-proto") return "http";
      return null;
    },
  }),
}));

describe("app/actions/auth.ts Server Actions", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("loginAction", () => {
    it("returns an error if email or password is missing", async () => {
      const formData = new FormData();
      formData.set("email", "test@example.com");
      // missing password

      const result = await loginAction(null, formData);
      expect(result).toEqual({
        success: false,
        error: "Please enter both email and password",
      });
      expect(createClient).not.toHaveBeenCalled();
    });

    it("handles plain object payload in addition to FormData", async () => {
      const result = await loginAction(null, { email: "", password: "" });
      expect(result).toEqual({
        success: false,
        error: "Please enter both email and password",
      });
    });

    it("authenticates successfully via createClient and returns plain success state", async () => {
      const mockSignInWithPassword = jest.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      });

      (createClient as jest.Mock).mockResolvedValue({
        auth: { signInWithPassword: mockSignInWithPassword },
      });

      const formData = new FormData();
      formData.set("email", "user@example.com");
      formData.set("password", "secret123");

      const result = await loginAction(null, formData);

      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "secret123",
      });
      expect(result).toEqual({
        success: true,
        error: null,
      });
    });

    it("serializes Supabase AuthError instances to plain strings (FM-6.1)", async () => {
      class MockAuthError extends Error {
        status = 400;
        constructor(message: string) {
          super(message);
          this.name = "AuthError";
        }
      }

      const mockSignInWithPassword = jest.fn().mockResolvedValue({
        data: null,
        error: new MockAuthError("Invalid login credentials"),
      });

      (createClient as jest.Mock).mockResolvedValue({
        auth: { signInWithPassword: mockSignInWithPassword },
      });

      const formData = new FormData();
      formData.set("email", "user@example.com");
      formData.set("password", "wrongpass");

      const result = await loginAction(null, formData);

      expect(result).toEqual({
        success: false,
        error: "Invalid login credentials",
      });
      // Ensure result is a plain object with string error (serializable)
      expect(typeof result.error).toBe("string");
    });

    it("catches unhandled exceptions defensively and returns error state", async () => {
      (createClient as jest.Mock).mockRejectedValue(
        new Error("Connection refused")
      );

      const formData = new FormData();
      formData.set("email", "user@example.com");
      formData.set("password", "pass");

      const result = await loginAction(null, formData);

      expect(result).toEqual({
        success: false,
        error: "Connection refused",
      });
    });
  });

  describe("forgotPasswordAction", () => {
    it("returns an error if email is missing", async () => {
      const formData = new FormData();
      const result = await forgotPasswordAction(null, formData);

      expect(result).toEqual({
        success: false,
        error: "Please enter your email address.",
      });
      expect(createClient).not.toHaveBeenCalled();
    });

    it("dispatches resetPasswordForEmail with proper redirectTo and returns success message", async () => {
      const mockResetPasswordForEmail = jest.fn().mockResolvedValue({
        data: {},
        error: null,
      });

      (createClient as jest.Mock).mockResolvedValue({
        auth: { resetPasswordForEmail: mockResetPasswordForEmail },
      });

      const formData = new FormData();
      formData.set("email", "user@example.com");

      const result = await forgotPasswordAction(null, formData);

      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        "user@example.com",
        expect.objectContaining({
          redirectTo: expect.stringContaining("/reset-password"),
        })
      );
      expect(result).toEqual({
        success: true,
        error: null,
        data: {
          message:
            "If an account with this email exists, a password reset link has been sent.",
        },
      });
    });

    it("handles resetPasswordForEmail error from Supabase", async () => {
      const mockResetPasswordForEmail = jest.fn().mockResolvedValue({
        data: null,
        error: { message: "Rate limit exceeded" },
      });

      (createClient as jest.Mock).mockResolvedValue({
        auth: { resetPasswordForEmail: mockResetPasswordForEmail },
      });

      const formData = new FormData();
      formData.set("email", "user@example.com");

      const result = await forgotPasswordAction(null, formData);

      expect(result).toEqual({
        success: false,
        error: "Rate limit exceeded",
      });
    });
  });

  describe("manualConfirmAction", () => {
    it("returns an error if email is missing", async () => {
      const formData = new FormData();
      const result = await manualConfirmAction(null, formData);

      expect(result).toEqual({
        success: false,
        error: "Please enter your email address",
      });
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it("blocks execution in production mode", async () => {
      (process.env as any).NODE_ENV = "production";

      const formData = new FormData();
      formData.set("email", "user@example.com");

      const result = await manualConfirmAction(null, formData);

      expect(result).toEqual({
        success: false,
        error:
          "Manual confirmation is disabled in production. Please check your email for the confirmation link.",
      });
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it("confirms user account in non-production mode by looking up user ID from email", async () => {
      (process.env as any).NODE_ENV = "development";

      const mockListUsers = jest.fn().mockResolvedValue({
        data: {
          users: [
            { id: "b2c3d4e5-1234-5678-9abc-def012345678", email: "user@example.com" },
          ],
        },
        error: null,
      });

      const mockUpdateUserById = jest.fn().mockResolvedValue({
        data: { user: { id: "b2c3d4e5-1234-5678-9abc-def012345678", email_confirmed_at: "2026-09-14T12:00:00Z" } },
        error: null,
      });

      (createAdminClient as jest.Mock).mockResolvedValue({
        auth: {
          admin: {
            listUsers: mockListUsers,
            updateUserById: mockUpdateUserById,
          },
        },
      });

      const formData = new FormData();
      formData.set("email", "user@example.com");

      const result = await manualConfirmAction(null, formData);

      expect(mockListUsers).toHaveBeenCalled();
      expect(mockUpdateUserById).toHaveBeenCalledWith(
        "b2c3d4e5-1234-5678-9abc-def012345678",
        {
          email_confirm: true,
        }
      );
      expect(result).toEqual({
        success: true,
        error: null,
        data: {
          message: "Account confirmed! You can now sign in.",
        },
      });
    });

    it("confirms user account directly when a UUID is provided", async () => {
      (process.env as any).NODE_ENV = "development";

      const mockListUsers = jest.fn();
      const mockUpdateUserById = jest.fn().mockResolvedValue({
        data: { user: { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" } },
        error: null,
      });

      (createAdminClient as jest.Mock).mockResolvedValue({
        auth: {
          admin: {
            listUsers: mockListUsers,
            updateUserById: mockUpdateUserById,
          },
        },
      });

      const formData = new FormData();
      formData.set("email", "a1b2c3d4-e5f6-7890-abcd-ef1234567890");

      const result = await manualConfirmAction(null, formData);

      expect(mockListUsers).not.toHaveBeenCalled();
      expect(mockUpdateUserById).toHaveBeenCalledWith(
        "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        { email_confirm: true }
      );
      expect(result.success).toBe(true);
    });

    it("handles user not found during email lookup", async () => {
      (process.env as any).NODE_ENV = "development";

      const mockListUsers = jest.fn().mockResolvedValue({
        data: { users: [] },
        error: null,
      });

      (createAdminClient as jest.Mock).mockResolvedValue({
        auth: {
          admin: {
            listUsers: mockListUsers,
            updateUserById: jest.fn(),
          },
        },
      });

      const formData = new FormData();
      formData.set("email", "notfound@example.com");

      const result = await manualConfirmAction(null, formData);

      expect(result).toEqual({
        success: false,
        error: "User with this email was not found. Please check the email and try again.",
      });
    });

    it("handles admin updateUserById failure", async () => {
      (process.env as any).NODE_ENV = "development";

      const mockListUsers = jest.fn().mockResolvedValue({
        data: {
          users: [
            { id: "b2c3d4e5-1234-5678-9abc-def012345678", email: "user@example.com" },
          ],
        },
        error: null,
      });

      const mockUpdateUserById = jest.fn().mockResolvedValue({
        data: null,
        error: { message: "Update failed" },
      });

      (createAdminClient as jest.Mock).mockResolvedValue({
        auth: {
          admin: {
            listUsers: mockListUsers,
            updateUserById: mockUpdateUserById,
          },
        },
      });

      const formData = new FormData();
      formData.set("email", "user@example.com");

      const result = await manualConfirmAction(null, formData);

      expect(result).toEqual({
        success: false,
        error: "Update failed",
      });
    });
  });
});
