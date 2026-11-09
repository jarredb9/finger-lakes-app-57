import nextConfig from "eslint-config-next";
import playwright from "eslint-plugin-playwright";

export default [
  {
    ignores: ["supabase/functions/**"],
  },
  ...nextConfig,
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "no-console": "warn",
      "no-nested-ternary": "warn",
      "react-hooks/set-state-in-effect": "warn",
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
