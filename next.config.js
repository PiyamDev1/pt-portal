/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Performance optimizations
  swcMinify: true, // Use SWC for minification (faster than Terser)
  
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
