import nextConfig from "eslint-config-next";

export default [
  ...nextConfig,
  {
    settings: {
      react: {
        version: "19.0",
      },
    },
    rules: {
      "no-console": "warn",
    },
  },
];
