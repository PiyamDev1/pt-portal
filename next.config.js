/**
 * Next.js Configuration
 * Build/runtime optimizations, security headers, and image/compression tuning.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // Reduce bundle size
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase member}}',
    },
  },

  // Enable experimental features for faster builds
  experimental: {
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js'],
  },

  // Optimize images and static assets
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // Enable compression for API responses (gzip + brotli on Vercel)
  compress: true,

  // Headers for caching and security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), microphone=(), camera=(self)',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://*.supabase.co; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.github.com https://eu49v2.piyamtravel.com; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';",
          },
        ],
      },
    ]
  },

  async redirects() {
    return [
      {
        source: '/dashboard/visas',
        destination: '/dashboard/applications/visa',
        permanent: true,
      },
      {
        source: '/dashboard/passports/pak',
        destination: '/dashboard/applications/passports',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
