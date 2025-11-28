import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    rules: {
      "no-console": "warn",
    },
  },
];
