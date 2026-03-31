import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    IS_E2E: process.env.IS_E2E || process.env.NEXT_PUBLIC_IS_E2E,
    NEXT_PUBLIC_IS_E2E: process.env.NEXT_PUBLIC_IS_E2E || process.env.IS_E2E,
  },
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
};

export default withSerwist(nextConfig);
