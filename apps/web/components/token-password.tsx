'use client';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { FieldsForm } from './ui';
import { BrandLogo } from './brand';
export default function TokenPassword({ invite }: { invite?: boolean }) {
  const [token, setToken] = useState(''); const captured = useRef(false);
  useEffect(() => { if (captured.current) return; captured.current = true; setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') ?? ''); window.history.replaceState(null, '', window.location.pathname); }, []);
  return <main className="auth-page"><section className="auth-card"><BrandLogo className="auth-logo" /><h1>{invite ? 'Davetinizi kabul edin' : 'Yeni parola belirleyin'}</h1><p className="muted mb-6">En az 12 karakter kullanın. Bağlantı tek kullanımlıktır.</p>{token ? <FieldsForm fields={[{ name: 'password', label: 'Yeni parola', type: 'password', required: true }]} onSave={values => api(invite ? '/auth/invitation/accept' : '/auth/password-reset/confirm', 'POST', { token, ...values })} /> : <p role="alert">Bağlantı tokenı bulunamadı. Davet veya sıfırlama bağlantısını yeniden açın.</p>}<Link className="text-link mt-5 inline-block" href="/login">Girişe dön</Link></section></main>;
}
