/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // DO NOT set output to 'export' - that breaks API routes
  // Leave undefined or use 'standalone' for serverless functions
}

module.exports = nextConfig
