import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/components/auth-provider'
import { GlobalModalRenderer } from '@/components/global-modal-renderer'
import { PwaHandler } from '@/components/pwa-handler'
import { E2EStoreExposer } from '@/components/e2e-store-exposer'

import { CookieConsent } from '@/components/cookie-consent'

export const metadata: Metadata = {
  title: 'Winery Visit Planner',
  description: 'Plan and track your visits to wineries worldwide.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FLX Winery',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport = {
  themeColor: '#7c2d12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <link rel="icon" href="/placeholder-logo.png" sizes="any" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(registration) {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                  }, function(err) {
                    console.log('ServiceWorker registration failed: ', err);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <TooltipProvider>
          <div className="relative flex min-h-screen flex-col">
            <main className="flex-1"><AuthProvider>{children}</AuthProvider></main>
            <Toaster />
            <PwaHandler />
            {(process.env.NODE_ENV !== 'production' || process.env.IS_E2E === 'true') && <E2EStoreExposer />}
            <GlobalModalRenderer />
            <CookieConsent />
          </div>
        </TooltipProvider>
      </body>
    </html>
  )
}