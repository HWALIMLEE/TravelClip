import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import Navbar from '@/components/layout/Navbar'
import ErrorReporter from '@/components/monitoring/ErrorReporter'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'TravelClip Planner - 릴스·쇼츠로 여행 계획 자동화',
  description:
    '여행 릴스와 쇼츠를 저장하면, AI가 장소를 추출하고 지도에 정리한 뒤, 현실적인 여행 동선과 예약 추천까지 만들어주는 서비스.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TravelClip',
  },
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon.svg',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-900 text-gray-100">
        <ErrorReporter />
        <Navbar />
        <main className="flex-1 flex flex-col pt-16">{children}</main>
        <Script id="register-sw" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
          }
        `}</Script>
      </body>
    </html>
  )
}
