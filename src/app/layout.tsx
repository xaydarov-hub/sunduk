import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/shared/ToastProvider';
import { AppProvider } from '@/components/shared/AppProvider';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'SUNDuk — Bar & VIP Karaoke',
  description: 'Bar va VIP karaoke xonalarini boshqarish tizimi',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#101011',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body className={`${inter.className} bg-graphite-900 text-white`}>
        <ToastProvider />
        <AppProvider>{children}</AppProvider>
      </body>
    </html>
  );
}
