import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3001'}/api/:path*` }];
  },
  // The service worker must always be fresh (new versions reach phones on the next open) and may only load itself.
  async headers() {
    return [{ source: '/sw.js', headers: [
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
      { key: 'Service-Worker-Allowed', value: '/' },
    ] }];
  },
};
export default config;
