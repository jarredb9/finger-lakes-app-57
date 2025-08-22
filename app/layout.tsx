import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { Toaster } from "@/components/ui/toaster"
import BottomNav from '@/components/bottom-nav'

export const metadata: Metadata = {
  title: 'v0 App',
  description: 'Created with v0',
  generator: 'v0.dev',
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
      </head>
      <body>
        <div className="relative flex min-h-screen flex-col">
          <main className="flex-1 pb-16 md:pb-0">{children}</main>
          <Toaster />
          <BottomNav />
        </div>
      </body>
    </html>
  )
}