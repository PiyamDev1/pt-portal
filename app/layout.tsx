import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Piyam Travels IMS',
  description: 'Employee Information Management System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr">
      <body className="flex flex-col min-h-screen">
        <div className="flex-grow">
          {children}
        </div>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
