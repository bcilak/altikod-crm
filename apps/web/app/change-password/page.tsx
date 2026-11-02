'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { api, setCsrf, ApiError } from '../../lib/api';
import { FieldsForm, Loading, Notice, useMe, Action } from '../../components/ui';
export default function ChangePassword() {
  const { data: me, error, isLoading } = useMe(); const router = useRouter(); const cache = useQueryClient();
  useEffect(() => { if (me) setCsrf(me.csrfToken); if (error instanceof ApiError && error.status === 401) router.replace('/login'); }, [me, error, router]);
  if (isLoading) return <Loading />;
  if (!me) return <Notice error={error} />;
  return <main className="auth-page"><section className="auth-card"><h1>Parolanızı değiştirin</h1><p>{me.mustChangePassword ? 'Devam etmek için geçici parolanızı değiştirin.' : 'Hesabınız için yeni bir parola belirleyin.'} En az 12 karakter kullanın.</p><FieldsForm label="Parolayı değiştir" fields={[
    { name: 'currentPassword', label: 'Mevcut / geçici parola', type: 'password', required: true },
    { name: 'password', label: 'Yeni parola', type: 'password', required: true },
    { name: 'confirmation', label: 'Yeni parola tekrar', type: 'password', required: true },
  ]} onSave={async values => {
    if (values.password !== values.confirmation) throw new Error('Yeni parolalar eşleşmiyor');
    await api('/auth/password/change', 'POST', { currentPassword: values.currentPassword, password: values.password });
    cache.clear(); setCsrf(''); router.replace('/login');
  }} /><p className="muted">Değişiklikten sonra yeni parolanızla tekrar giriş yapacaksınız.</p><Action run={async () => { await api('/auth/logout', 'POST'); cache.clear(); setCsrf(''); router.replace('/login'); }}>Çıkış yap</Action></section></main>;
}
