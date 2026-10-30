'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, setCsrf, type Me } from '../../lib/api';
import { FieldsForm } from '../../components/ui';
import { BrandLogo } from '../../components/brand';
/** Only same-site paths are accepted as a return target (no open redirect). */
const safeNext = (value: string | null) => value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !value.startsWith('/login') ? value : '/dashboard';
function Login() {
  const router = useRouter(); const cache = useQueryClient(); const next = safeNext(useSearchParams().get('next'));
  return <main className="auth-page"><section className="auth-card"><BrandLogo className="auth-logo" /><p className="eyebrow">ALTIKOD CRM</p><h1>Çalışma alanına giriş</h1><p className="muted mb-6">Müşteriler, takipler ve satış fırsatları bir arada.</p><FieldsForm fields={[{ name: 'email', label: 'E-posta', type: 'email', required: true }, { name: 'password', label: 'Parola', type: 'password', required: true }]} label="Giriş yap" onSave={async values => { const result = await api<{ user: Me; csrfToken: string }>('/auth/login', 'POST', values); cache.clear(); setCsrf(result.csrfToken); router.replace(next); }} /><Link href="/forgot-password" className="text-link mt-5 inline-block">Parolamı unuttum</Link></section></main>;
}
export default function LoginRoute() { return <Suspense><Login /></Suspense>; }
