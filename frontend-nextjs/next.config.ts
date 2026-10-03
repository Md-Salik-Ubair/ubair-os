/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 1. Permanently remove the 'N' Dev Indicator & build badges
  devIndicators: {
    buildActivity: false,
    appIsrStatus: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;