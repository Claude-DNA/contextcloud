import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import { requestLocale } from '@/i18n/server';
import { translate } from '@/i18n/core';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: translate(locale, 'ContextCloud Studio — Build Context for ContextTube'),
    description: translate(locale, 'The authoring platform for ContextTube. Build structured context clouds and flows, then publish to contextube.ai.'),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  return (
    <html lang={locale}>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
