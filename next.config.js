/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // DO NOT set output to 'export' - that breaks API routes
  // Leave undefined or use 'standalone' for serverless functions
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
