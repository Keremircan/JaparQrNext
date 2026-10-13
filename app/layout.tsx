import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

// Manifest app/manifest.ts dosyasından üretilir ve <head>'e otomatik eklenir.
export const metadata: Metadata = {
  title: 'Japar PDKS',
  description: 'Personel Devam Takip Sistemi',
  appleWebApp: {
    capable: true,
    // Açık zeminli sayfalarda saat/pil simgeleri okunabilsin diye koyu yazılı
    // varsayılan durum çubuğu (black-translucent beyaz yazı kullanır).
    statusBarStyle: 'default',
    title: 'Japar PDKS',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon-180x180.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // Çentik ve alt çizgi alanını tam ekran yapmak için
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
