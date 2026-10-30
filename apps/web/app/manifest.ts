import type { MetadataRoute } from 'next';

/** Installable app (Android “Uygulamayı yükle”, iPhone “Ana Ekrana Ekle”); iPhone needs this for Web Push (iOS 16.4+). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Altıkod CRM', short_name: 'Altıkod CRM', description: 'Altıkod Digital Solutions iç satış, müşteri ve ekip mesajlaşma sistemi',
    lang: 'tr', dir: 'ltr', start_url: '/dashboard', scope: '/', display: 'standalone', orientation: 'any',
    background_color: '#fff9f6', theme_color: '#d6382a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mesajlar', url: '/messages', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Bildirimler', url: '/notifications', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
