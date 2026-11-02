'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setCsrf, type Me } from '../../lib/api';
import { Action, Loading, Notice, useMe } from '../../components/ui';
import { WorkingDrafts } from '../../components/working-drafts';
import MobileNavigation, { useMobileViewport } from '../../components/mobile-navigation';
import { BrandLogo } from '../../components/brand';
import { conversationsKey, type ConversationList } from '../../lib/messaging';
import { LiveProvider, useLiveIntervals } from '../../components/live';
import { forgetThisDevice, useAppShell } from '../../components/pwa';
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { data: me, error, isLoading } = useMe(); const router = useRouter(); const cache = useQueryClient();
  // Coming back after the session ended (e.g. from a phone notification): sign in, then continue to the same page.
  useEffect(() => { if (me) setCsrf(me.csrfToken); if (error instanceof ApiError && error.status === 401) { cache.clear(); setCsrf(''); router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); } }, [me, error, router, cache]);
  if (isLoading) return <Loading />;
  if (!me) return <main className="p-8"><Notice error={error} /><Link href="/login">Giriş yap</Link></main>;
  return <LiveProvider><WorkingDrafts key={me.id}><Shell me={me}>{children}</Shell></WorkingDrafts></LiveProvider>;
}
const count = (n: number) => n > 99 ? '99+' : String(n);
function Shell({ me, children }: { me: Me; children: React.ReactNode }) {
  const router = useRouter(); const path = usePathname(); const cache = useQueryClient(); const live = useLiveIntervals();
  const [mobileOpen, setMobileOpen] = useState(false);
  useMobileViewport();
  const conversations = useQuery({ queryKey: conversationsKey, queryFn: () => api<ConversationList>('/messaging/conversations'), refetchInterval: live.list, retry: false });
  const notifications = useQuery({ queryKey: ['/notifications'], queryFn: () => api<{ readAt?: string | null }[]>('/notifications'), refetchInterval: live.connected ? false : 60_000, retry: false });
  const badges: Record<string, number> = { '/messages': conversations.data?.unreadTotal ?? 0, '/notifications': notifications.data?.filter(n => !n.readAt).length ?? 0 };
  useAppShell(badges['/messages']! + badges['/notifications']!);
  const links = [['/dashboard', 'Bugün'], ['/messages', 'Mesajlar'], ...(me.role !== 'TECHNICAL' ? [['/companies', 'Firmalar'], ['/opportunities', 'Fırsatlar'], ['/quotes', 'Teklifler'], ['/catalog', 'Katalog'], ['/handoffs', 'İş devri'], ['/activities', 'Faaliyetler'], ['/calendar', 'Takvim']] : []), ['/projects', 'Projeler'], ['/tasks', 'Görevler'], ['/knowledge', 'Bilgi bankası'], ['/academy', 'Akademi'], ['/notifications', 'Bildirimler'], ...(['ADMIN','MANAGER','SALES'].includes(me.role) ? [['/reports','Raporlar'], ['/imports','CSV aktarımı']] : []), ...(me.role === 'ADMIN' ? [['/settings/users', 'Kullanıcılar'], ['/settings/company','Şirket ayarları'], ['/settings/audit', 'Denetim kaydı']] : [])];
  return <div className="app-shell"><a className="skip-link" href="#main">İçeriğe geç</a><aside className={`sidebar${mobileOpen ? " menu-open" : ""}`}><Link href="/dashboard" className="brand"><BrandLogo /><span className="brand-tag">CRM</span></Link><p className="nav-caption">ÇALIŞMA ALANI</p><button className="mobile-menu btn" aria-expanded={mobileOpen} aria-controls="main-menu" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? "Menüyü kapat" : "Menüyü aç"}</button><nav id="main-menu" aria-label="Ana menü">{links.map(([url, label]) => <Link key={url} href={url!} onClick={() => setMobileOpen(false)} aria-current={path.startsWith(url!) ? 'page' : undefined}>{label}{!!badges[url!] && <span className="nav-count" aria-label={`, ${badges[url!]} okunmamış`}>{count(badges[url!]!)}</span>}</Link>)}</nav><div className="sidebar-bottom"><strong>{me.name}</strong><small>{me.role}</small><Action run={async () => { await forgetThisDevice(); await api('/auth/logout', 'POST'); cache.clear(); setCsrf(''); router.replace('/login'); }}>Çıkış yap</Action></div></aside><div className="workspace"><header className="topbar"><span>Satış çalışma alanı</span><span className="muted">Europe/Istanbul · {me.name}{live.offline && <span role="status"> · canlı bağlantı yok, kısa aralıklarla yenileniyor</span>}</span></header><main id="main" className="main-content">{children}</main></div><MobileNavigation path={path} technical={me.role === 'TECHNICAL'} unread={badges['/messages']!} /></div>;
}
