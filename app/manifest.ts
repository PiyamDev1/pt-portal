import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Piyam Travels IMS',
    short_name: 'PT IMS',
    description: 'Piyam Travels employee information management system',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#064e3b',
    orientation: 'portrait',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/maskable-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
