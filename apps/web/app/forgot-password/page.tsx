'use client';
import Link from 'next/link';
import { api } from '../../lib/api';
import { FieldsForm } from '../../components/ui';
import { BrandLogo } from '../../components/brand';
export default function ForgotPassword() { return <main className="auth-page"><section className="auth-card"><BrandLogo className="auth-logo" /><h1>Parola sıfırlama</h1><p className="muted mb-6">Hesabınız uygunsa sıfırlama bağlantısı hazırlanır. Yerel geliştirme ortamında bağlantılar yöneticinin yerel posta klasörüne yazılır.</p><FieldsForm fields={[{ name: 'email', label: 'E-posta', type: 'email', required: true }]} label="Bağlantı iste" onSave={values => api('/auth/password-reset/request', 'POST', values)} /><Link className="text-link" href="/login">Girişe dön</Link></section></main>; }
