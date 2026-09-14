import { render, screen, fireEvent } from "@testing-library/react";
import GlobalError from "@/app/error";

describe("GlobalError boundary component (app/error.tsx)", () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it("renders error card with title, description, and actions", () => {
    const mockReset = jest.fn();
    const testError = new Error("Test server crash");

    render(<GlobalError error={testError} reset={mockReset} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("An unexpected error occurred while loading this page.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /return home/i })).toHaveAttribute("href", "/");
  });

  it("logs error to console.error on mount", () => {
    const mockReset = jest.fn();
    const testError = new Error("Database timeout");

    render(<GlobalError error={testError} reset={mockReset} />);

    expect(console.error).toHaveBeenCalledWith(
      "[AppRouter] Uncaught application error:",
      testError
    );
  });

  it("renders error digest when provided", () => {
    const mockReset = jest.fn();
    const testError = Object.assign(new Error("Digest error"), {
      digest: "CRASH_DIGEST_12345",
    });

    render(<GlobalError error={testError} reset={mockReset} />);

    expect(screen.getByText(/CRASH_DIGEST_12345/)).toBeInTheDocument();
  });

  it("calls reset callback when Try Again button is clicked", () => {
    const mockReset = jest.fn();
    const testError = new Error("Recoverable error");

    render(<GlobalError error={testError} reset={mockReset} />);

    const tryAgainButton = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(tryAgainButton);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
