'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, formatDate } from '../lib/api';
import { Notice, useData } from './ui';

type Device = { id: string; label: string; showPreview: boolean; createdAt: string; lastSuccessAt: string | null; current: boolean };
type PushState = { enabled: boolean; publicKey: string | null; devices: Device[] };
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** The browser offers installation once, early; keep the event so the settings card can use it later. */
let installEvent: InstallEvent | null = null; const installListeners = new Set<() => void>();
const installStore = { subscribe: (f: () => void) => { installListeners.add(f); return () => installListeners.delete(f); }, get: () => installEvent };

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const standalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const keyBytes = (base64url: string) => { const raw = atob((base64url + '='.repeat((4 - base64url.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
async function currentSubscription() { if (!supported()) return null; const reg = await navigator.serviceWorker.getRegistration('/'); return reg ? reg.pushManager.getSubscription() : null; }

/** Unsubscribes this browser before signing out; the server also drops the device with the session. */
export async function forgetThisDevice() { try { await (await currentSubscription())?.unsubscribe(); } catch { /* best effort */ } }

/**
 * App shell integration: registers the service worker, re-binds an existing subscription to the current session
 * (sessions last 8 h; subscriptions outlive them), follows notification clicks and mirrors unread counts on the app icon.
 */
export function useAppShell(unread: number) {
  const router = useRouter();
  useEffect(() => {
    const onInstall = (e: Event) => { e.preventDefault(); installEvent = e as InstallEvent; installListeners.forEach(f => f()); };
    window.addEventListener('beforeinstallprompt', onInstall);
    if (!('serviceWorker' in navigator)) return () => window.removeEventListener('beforeinstallprompt', onInstall);
    const onMessage = (e: MessageEvent) => { if (e.data?.type === 'open' && typeof e.data.url === 'string') { const url = new URL(e.data.url); if (url.origin === location.origin) router.push(url.pathname + url.search); } };
    navigator.serviceWorker.addEventListener('message', onMessage);
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(async () => {
      if (!supported() || Notification.permission !== 'granted') return;
      const sub = await currentSubscription();
      if (sub) await api('/push/subscriptions', 'POST', sub.toJSON()).catch(() => undefined);
    }).catch(() => undefined);
    return () => { window.removeEventListener('beforeinstallprompt', onInstall); navigator.serviceWorker.removeEventListener('message', onMessage); };
  }, [router]);
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (unread > 0) void nav.setAppBadge?.(unread).catch(() => undefined); else void nav.clearAppBadge?.().catch(() => undefined);
  }, [unread]);
}

/** “Telefon ve bilgisayar bildirimleri”: install guidance, permission, this device, the user's other devices. */
export function PushSettings() {
  const cache = useQueryClient(); const { data, error } = useData<PushState>('/push/devices');
  const install = useSyncExternalStore(installStore.subscribe, installStore.get, () => null);
  const [env, setEnv] = useState<{ supported: boolean; ios: boolean; standalone: boolean; permission: string; subscribed: boolean } | null>(null);
  const [busy, setBusy] = useState(false); const [problem, setProblem] = useState<unknown>(); const [result, setResult] = useState<string>();
  const refresh = async () => {
    const sub = await currentSubscription().catch(() => null);
    setEnv({ supported: supported(), ios: isIos(), standalone: standalone(), permission: supported() ? Notification.permission : 'unsupported', subscribed: !!sub });
    await cache.invalidateQueries({ queryKey: ['/push/devices'] });
  };
  // Runs once: reads browser capabilities that only exist on the client.
  useEffect(() => { void refresh(); }, []);
  const run = async (task: () => Promise<unknown>) => { setBusy(true); setProblem(undefined); setResult(undefined); try { await task(); } catch (e) { setProblem(e); } finally { setBusy(false); await refresh(); } };
  const enable = () => run(async () => {
    if (!data?.publicKey) throw new Error('Sunucuda bildirim anahtarı yapılandırılmadı');
    const permission = await Notification.requestPermission(); // must run directly from the button press (iOS)
    if (permission !== 'granted') throw new Error('Bildirim izni verilmedi. İzni cihaz ayarlarından açabilirsiniz.');
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with an older server key cannot be reused.
    if (sub && sub.options.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== data.publicKey) { await sub.unsubscribe(); sub = null; }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.publicKey) });
    await api('/push/subscriptions', 'POST', sub.toJSON());
  });
  const remove = (d: Device) => run(async () => { if (d.current) await forgetThisDevice(); await api(`/push/devices/${d.id}/remove`, 'POST'); });
  const preview = (d: Device, showPreview: boolean) => run(() => api(`/push/devices/${d.id}`, 'PATCH', { showPreview }));
  const test = () => run(async () => { const r = await api<{ sent: number; failed: number }>('/push/test', 'POST'); setResult(r.failed ? `${r.sent} cihaza gönderildi, ${r.failed} cihaza ulaşılamadı (ulaşılamayan cihaz listeden kalkar).` : `${r.sent} cihaza test bildirimi gönderildi.`); });

  if (error) return <Notice error={error} />;
  if (!data || !env) return <p role="status" className="muted">Yükleniyor…</p>;
  const thisDevice = data.devices.find(d => d.current);
  return <div className="push-settings">
    {!data.enabled && <p className="notice">Telefon bildirimleri bu sunucuda henüz yapılandırılmadı (yönetici: <code>WEB_PUSH_*</code> ayarları).</p>}
    {env.ios && !env.standalone && <div className="notice install-steps"><strong>iPhone / iPad'de bildirim için önce uygulamayı ekleyin:</strong>
      <ol><li>Bu sayfayı <strong>Safari</strong>'de açın.</li><li>Alttaki <strong>Paylaş</strong> düğmesine (kare ve yukarı ok) dokunun.</li><li><strong>Ana Ekrana Ekle</strong>'yi seçip <strong>Ekle</strong>'ye dokunun.</li><li>Ana ekrandaki <strong>Altıkod CRM</strong> simgesinden açın, giriş yapın ve bu sayfadan bildirimleri açın.</li></ol>
      <small className="muted">iOS 16.4 veya üstü gerekir. Uygulama Safari'den ayrı oturum kullanır; bir kez giriş yapmanız gerekir.</small></div>}
    {install && !env.standalone && <p><button type="button" className="btn" onClick={async () => { await install.prompt(); await install.userChoice; installEvent = null; installListeners.forEach(f => f()); }}>Uygulamayı bu cihaza yükle</button></p>}
    {data.enabled && !(env.ios && !env.standalone) && (!env.supported
      ? <p className="notice">Bu tarayıcı bildirimleri desteklemiyor. Chrome, Edge, Firefox veya Safari'nin güncel sürümünü kullanın.</p>
      : env.permission === 'denied'
        ? <p className="notice">Bu cihazda bildirim izni kapalı. Tarayıcı veya telefon ayarlarından Altıkod CRM için bildirimlere izin verin, sonra sayfayı yenileyin.</p>
        : thisDevice && env.subscribed
          ? <p className="success" role="status">Bu cihaz bildirim alıyor.</p>
          : <p><button type="button" className="btn primary" disabled={busy} onClick={() => void enable()}>Bu cihazda bildirimleri aç</button></p>)}
    <Notice error={problem} />{result && <p role="status" className="success">{result}</p>}
    {data.devices.length > 0 && <><h3 className="push-title">Bildirim alan cihazlarınız</h3><ul className="device-list">{data.devices.map(d => <li key={d.id} className="record">
      <div><strong>{d.label}</strong>{d.current && <span className="badge">bu cihaz</span>}<small className="muted block">Eklendi {formatDate(d.createdAt)}{d.lastSuccessAt ? ` · son bildirim ${formatDate(d.lastSuccessAt)}` : ''}</small>
        <label className="check-option"><input type="checkbox" checked={d.showPreview} disabled={busy} onChange={e => void preview(d, e.target.checked)} /><span>Kilit ekranında mesaj içeriğini göster</span></label></div>
      <button type="button" className="btn" disabled={busy} onClick={() => void remove(d)}>Kaldır</button></li>)}</ul>
      <p><button type="button" className="btn" disabled={busy} onClick={() => void test()}>Test bildirimi gönder</button></p></>}
    <small className="muted">Varsayılan olarak kilit ekranında yalnız “kim, ne tür bildirim” görünür; müşteri bilgisi içerebilecek metin cihaz bazında açılırsa gösterilir. Çıkış yaptığınız cihaz bildirim almayı bırakır.</small>
  </div>;
}
