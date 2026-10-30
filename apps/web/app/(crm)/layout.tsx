'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setCsrf } from '../../lib/api';
import { Action, Loading, Notice, useMe } from '../../components/ui';
import { BrandLogo } from '../../components/brand';
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const { data: me, error, isLoading } = useMe(); const router = useRouter(); const path = usePathname(); const cache = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { if (me) setCsrf(me.csrfToken); if (error instanceof ApiError && error.status === 401) { cache.clear(); setCsrf(''); router.replace('/login'); } }, [me, error, router, cache]);
  if (isLoading) return <Loading />;
  if (!me) return <main className="p-8"><Notice error={error} /><Link href="/login">Giriş yap</Link></main>;
  const links = [['/dashboard', 'Bugün'], ...(me.role !== 'TECHNICAL' ? [['/companies', 'Firmalar'], ['/opportunities', 'Fırsatlar'], ['/quotes', 'Teklifler'], ['/catalog', 'Katalog'], ['/handoffs', 'İş devri'], ['/activities', 'Faaliyetler'], ['/calendar', 'Takvim']] : []), ['/projects', 'Projeler'], ['/tasks', 'Görevler'], ['/knowledge', 'Bilgi bankası'], ['/academy', 'Akademi'], ['/notifications', 'Bildirimler'], ...(['ADMIN','MANAGER','SALES'].includes(me.role) ? [['/reports','Raporlar'], ['/imports','CSV aktarımı']] : []), ...(me.role === 'ADMIN' ? [['/settings/users', 'Kullanıcılar'], ['/settings/company','Şirket ayarları'], ['/settings/audit', 'Denetim kaydı']] : [])];
  return <div className="app-shell"><a className="skip-link" href="#main">İçeriğe geç</a><aside className={`sidebar${mobileOpen ? " menu-open" : ""}`}><Link href="/dashboard" className="brand"><BrandLogo /><span className="brand-tag">CRM</span></Link><p className="nav-caption">ÇALIŞMA ALANI</p><button className="mobile-menu btn" aria-expanded={mobileOpen} aria-controls="main-menu" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? "Menüyü kapat" : "Menüyü aç"}</button><nav id="main-menu" aria-label="Ana menü">{links.map(([url, label]) => <Link key={url} href={url!} onClick={() => setMobileOpen(false)} aria-current={path.startsWith(url!) ? 'page' : undefined}>{label}</Link>)}</nav><div className="sidebar-bottom"><strong>{me.name}</strong><small>{me.role}</small><Action run={async () => { await api('/auth/logout', 'POST'); cache.clear(); setCsrf(''); router.replace('/login'); }}>Çıkış yap</Action></div></aside><div className="workspace"><header className="topbar"><span>Satış çalışma alanı</span><span className="muted">Europe/Istanbul · {me.name}</span></header><main id="main" className="main-content">{children}</main></div></div>;
}
