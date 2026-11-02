'use client';
import Link from 'next/link';
import { useEffect } from 'react';

/** Keep the composer inside the visible viewport when a phone keyboard resizes it. */
export function useMobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--visible-height', `${height}px`);
      const typing = document.activeElement?.matches('input, textarea, [contenteditable="true"]');
      document.documentElement.classList.toggle('keyboard-open', !!typing && window.innerHeight - height > 120);
    };
    update(); viewport?.addEventListener('resize', update); window.addEventListener('resize', update);
    document.addEventListener('focusin', update); document.addEventListener('focusout', update);
    return () => { viewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); document.documentElement.classList.remove('keyboard-open'); document.documentElement.style.removeProperty('--visible-height'); };
  }, []);
}

const symbols: Record<string, string> = { '/dashboard': '⌂', '/tasks': '✓', '/calendar': '▦', '/messages': '✉', '/projects': '▤' };
export default function MobileNavigation({ path, technical, unread }: { path: string; technical: boolean; unread: number }) {
  const links = [['/dashboard', 'Bugün'], ['/tasks', 'İşler'], technical ? ['/projects', 'Projeler'] : ['/calendar', 'Takvim'], ['/messages', 'Mesajlar']];
  return <nav className="mobile-bottom-nav" aria-label="Hızlı gezinme">{links.map(([url, label]) => <Link key={url} href={url!} aria-current={path.startsWith(url!) ? 'page' : undefined}><span className="mobile-nav-icon" aria-hidden="true">{symbols[url!]}</span><span>{label}</span>{url === '/messages' && unread > 0 && <span className="mobile-unread" aria-label={`${unread} okunmamış mesaj`}>{unread > 99 ? '99+' : unread}</span>}</Link>)}</nav>;
}
