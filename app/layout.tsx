import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import { ProgressBarProvider } from './components/ProgressBarProvider'
import { WebVitalsReporter } from './components/WebVitalsReporter'
import './globals.css'

export const metadata: Metadata = {
  title: 'Piyam Travels IMS',
  description: 'Employee Information Management System',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr">
      <body className="flex flex-col min-h-screen">
        <ProgressBarProvider />
        <div className="flex-grow">
          {children}
        </div>
        <Toaster position="top-center" richColors />
        <WebVitalsReporter />
      </body>
    </html>
  )
}
