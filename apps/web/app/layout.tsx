import type { Metadata, Viewport } from 'next';
import './globals.css';
import './fonts.css';
import './playful.css';
import './messaging.css';
import Providers from '../components/providers';

export const metadata: Metadata = {
  title: 'Altıkod CRM', description: 'Altıkod Digital Solutions iç satış ve müşteri yönetimi sistemi', applicationName: 'Altıkod CRM',
  // iPhone home-screen app: full-screen, own title, status bar over the app's light background.
  appleWebApp: { capable: true, title: 'Altıkod CRM', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};
/** viewport-fit=cover lets the layout use the iPhone safe areas (notch, home indicator); see messaging.css. */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#d6382a' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body><Providers>{children}</Providers></body></html>;
}
