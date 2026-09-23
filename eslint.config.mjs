import nextConfig from "eslint-config-next";
import playwright from "eslint-plugin-playwright";

export default [
  {
    ignores: ["supabase/functions/**"],
  },
  ...nextConfig,
  {
    rules: {
      "no-console": "warn",
    },
  },
  {
    files: ["e2e/**/*.{ts,js}"],
    plugins: {
      playwright,
    },
    rules: {
      "playwright/no-wait-for-timeout": "error",
      "playwright/no-force-option": "warn",
    },
  },
];
