/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Explicitly disable static export to ensure API routes work as serverless functions
  output: undefined,
}

module.exports = nextConfig
