import type { Metadata } from 'next';
import './globals.css';
import './fonts.css';
import './playful.css';
import './messaging.css';
import Providers from '../components/providers';

export const metadata: Metadata = { title: 'Altıkod CRM', description: 'Altıkod Digital Solutions iç satış ve müşteri yönetimi sistemi' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body><Providers>{children}</Providers></body></html>;
}
