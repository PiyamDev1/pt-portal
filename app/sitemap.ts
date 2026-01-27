import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://piyamtravels.com'
  const routes = [
    '',
    '/login',
    '/login/setup-2fa',
    '/login/verify-2fa',
  ]
  const now = new Date()
  return routes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path ? 0.7 : 1,
  }))
}
