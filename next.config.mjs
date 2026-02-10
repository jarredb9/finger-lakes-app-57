/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  images: {
    unoptimized: true,
  },
}

const configurePWA = async (config) => {
  if (process.env.NODE_ENV === 'production') {
    const withSerwistInit = (await import("@serwist/next")).default;
    const withSerwist = withSerwistInit({
      swSrc: "app/sw.ts",
      swDest: "public/sw.js",
    });
    return withSerwist(config);
  }
  return config;
};

export default configurePWA(nextConfig);
