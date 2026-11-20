import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

// Telefonda "Bosh ekranga qo'shish" qilinganda ilova alohida (brauzer panelisiz) ochiladi.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SUNDuk — Bar & VIP Karaoke',
    short_name: 'SUNDuk',
    description: 'Bar va VIP karaoke xonalarini boshqarish tizimi',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#101011',
    theme_color: '#101011',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
