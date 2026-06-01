import nextConfig from "eslint-config-next";

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
];
