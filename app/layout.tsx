/**
 * Root Application Layout
 * Defines global metadata, providers, and shared UI wrappers used by all routes.
 *
 * @module app/layout
 */

import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { ProgressBarProvider } from './components/ProgressBarProvider'
import { WebVitalsReporter } from './components/WebVitalsReporter'
import { ApiLatencyReporter } from './components/ApiLatencyReporter'
import { GlobalFooter } from './components/GlobalFooter'
import { IssueReporterWidget } from './components/IssueReporterWidget'
import { PWAInstallPrompt } from './components/PWAInstallPrompt'
import { ServiceWorkerRegistrar } from './components/ServiceWorkerRegistrar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Piyam Travels IMS',
  description: 'Employee Information Management System',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://piyamtravels.com'),
  manifest: '/manifest.webmanifest',
  applicationName: 'PT IMS',
  appleWebApp: {
    capable: true,
    title: 'PT IMS',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'Piyam Travels IMS',
    description: 'Employee Information Management System',
    url: process.env.NEXT_PUBLIC_SITE_URL || 'https://piyamtravels.com',
    siteName: 'Piyam Travels IMS',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'Piyam Travels IMS',
      },
    ],
    locale: 'en_GB',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Piyam Travels IMS',
    description: 'Employee Information Management System',
    images: ['/logo.png'],
  },
}

export const viewport: Viewport = {
  themeColor: '#064e3b',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="flex flex-col min-h-screen">
        <ProgressBarProvider />
        <div className="flex-grow">{children}</div>
        <GlobalFooter />
        <Toaster position="top-center" richColors />
        <IssueReporterWidget />
        <WebVitalsReporter />
        <ApiLatencyReporter />
        <PWAInstallPrompt />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
