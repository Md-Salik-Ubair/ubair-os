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

// 2. Production-Grade Metadata with Google Verification & Brand Ownership
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://ubair-os.vercel.app'),
  title: {
    default: 'Ubair OS — Md Salik Ubair | Autonomous AI OS',
    template: '%s · Ubair OS',
  },
  description:
    'Ubair OS is an Autonomous Multi-Model AI Operating System & Sovereign Neural Workspace architected by Founder & Principal Architect Md Salik Ubair.',
  applicationName: 'Ubair OS',
  authors: [
    { name: 'Md Salik Ubair', url: 'https://github.com/Md-Salik-Ubair' },
    { name: 'Md Salik Ubair', url: 'https://www.linkedin.com/in/md-salik-ubair-17955b387/' },
  ],
  creator: 'Md Salik Ubair',
  publisher: 'Ubair OS',
  keywords: [
    'Ubair OS',
    'Md Salik Ubair',
    'Autonomous Multi-Model AI Operating System',
    'Sovereign Neural Workspace',
    'Multi-LLM Inference Mesh',
    'AI Operating System',
  ],
  verification: {
    google: '9ZO4TYBPHZiy2Pidi8Z4gLYj6sEZVVMz10rMl6jBRtI',
  },
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
    title: 'Ubair OS — Md Salik Ubair | Autonomous AI OS',
    description:
      'Autonomous Multi-Model AI Operating System & Sovereign Neural Workspace by Founder & Principal Architect Md Salik Ubair.',
    url: 'https://ubair-os.vercel.app',
    siteName: 'Ubair OS',
    type: 'website',
    images: [
      {
        url: '/assets/ubair-logo.png',
        width: 512,
        height: 512,
        alt: 'Ubair OS Logo',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Ubair OS — Md Salik Ubair | Autonomous AI OS',
    description:
      'Autonomous Multi-Model AI Operating System & Sovereign Neural Workspace by Founder & Principal Architect Md Salik Ubair.',
    images: ['/assets/ubair-logo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

// 3. Structured Entity Schema for Google & Bing AI Knowledge Graphs
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://ubair-os.vercel.app/#software',
      name: 'Ubair OS',
      alternateName: 'Ubair OS — Sovereign Neural Workspace',
      applicationCategory: 'Artificial Intelligence Operating System',
      operatingSystem: 'Web, Cloud',
      url: 'https://ubair-os.vercel.app',
      description:
        'Autonomous Multi-Model AI Operating System featuring a 4-tier LLM inference failover mesh, dual Redis/pgvector memory engine, verified search synthesis, and seven specialized workstations.',
      founder: {
        '@id': 'https://ubair-os.vercel.app/#founder',
      },
      author: {
        '@id': 'https://ubair-os.vercel.app/#founder',
      },
    },
    {
      '@type': 'Person',
      '@id': 'https://ubair-os.vercel.app/#founder',
      name: 'Md Salik Ubair',
      jobTitle: 'Founder & Principal Architect',
      url: 'https://github.com/Md-Salik-Ubair',
      sameAs: [
        'https://github.com/Md-Salik-Ubair',
        'https://github.com/Md-Salik-Ubair/ubair-os',
        'https://www.linkedin.com/in/md-salik-ubair-17955b387/',
        'https://dev.to/mdsalikubair',
      ],
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}