import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Japar PDKS',
    short_name: 'Japar PDKS',
    description: 'Personel Devam Takip Sistemi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Açılış ekranı uygulamanın açık zeminiyle aynı renkte olsun
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    orientation: 'portrait',
    // Dosyalar public/icons altından sunulur
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
