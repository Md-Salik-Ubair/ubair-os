import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import AuthProvider from '../components/providers/AuthProvider';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
});

// 1. Dedicated Viewport Export (Next.js Standard)
export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

// 2. Production-Grade Metadata with Real Brand Icon Linking
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: {
    default: 'Ubair OS',
    template: '%s · Ubair OS',
  },
  description: 'Ubair OS Elite Intelligence Platform & Neural Workspace founded by Md Salik Ubair.',
  applicationName: 'Ubair OS',
  authors: [{ name: 'Md Salik Ubair', url: 'https://ubair.os' }],
  keywords: ['Ubair OS', 'Neural Workspace', 'Intelligence Platform', 'AI Studio', 'Multimodal LLM'],
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  openGraph: {
    title: 'Ubair OS — Neural Workspace',
    description: 'Ubair OS Elite Intelligence Platform & Neural Workspace',
    siteName: 'Ubair OS',
    type: 'website',
    images: [
      {
        url: '/assets/ubair-logo.png',
        width: 512,
        height: 512,
        alt: 'Ubair OS Neural Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Ubair OS — Neural Workspace',
    description: 'Ubair OS Elite Intelligence Platform & Neural Workspace',
    images: ['/assets/ubair-logo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full" suppressHydrationWarning>
      <body 
        className={`${inter.className} bg-black text-white antialiased selection:bg-cyan-500/20 selection:text-white h-[100dvh] w-full overflow-hidden overscroll-none`}
        suppressHydrationWarning
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}