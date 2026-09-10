import withSerwistInit from "@serwist/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  env: {
    IS_E2E: process.env.IS_E2E || process.env.NEXT_PUBLIC_IS_E2E,
    NEXT_PUBLIC_IS_E2E: process.env.NEXT_PUBLIC_IS_E2E || process.env.IS_E2E,
  },
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ["127.0.0.1"],
};

const isProduction = process.env.NODE_ENV === "production";

const finalConfig = isProduction
  ? withSerwistInit({
      swSrc: "app/sw.ts",
      swDest: "public/sw.js",
    })(nextConfig)
  : nextConfig;

export default finalConfig;
