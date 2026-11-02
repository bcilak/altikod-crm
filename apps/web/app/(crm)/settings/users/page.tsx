'use client';
import Link from 'next/link';
import { api, type Person } from '../../../../lib/api';
import { Editor, FieldsForm, Notice, Title, useData, useMe, options } from '../../../../components/ui';
const roles = options({ ADMIN: 'Yönetici (ADMIN)', MANAGER: 'Satış yöneticisi', SALES: 'Satış', TECHNICAL: 'Teknik', VIEWER: 'Görüntüleyici' });
export default function Users() {
  const { data: me } = useMe(); const { data, error } = useData<(Person & { email: string; isActive: boolean; mustChangePassword: boolean })[]>('/users', me?.role === 'ADMIN');
  if (me?.role !== 'ADMIN') return <Notice error="Bu sayfa yalnız yöneticiler içindir." />;
  return <><Title title="Kullanıcı yönetimi" subtitle="Hesap oluşturma, roller ve parola yönetimi." />
    <Editor title="Kullanıcı oluştur" open><FieldsForm label="Kullanıcı oluştur" fields={[
      { name: 'name', label: 'Ad soyad', required: true }, { name: 'email', label: 'Giriş e-postası', type: 'email', required: true },
      { name: 'role', label: 'Rol', type: 'select', required: true, options: roles },
      { name: 'temporaryPassword', label: 'Geçici parola', type: 'password', required: true, help: 'En az 12 karakter. Kullanıcıya doğrudan iletin.' },
    ]} onSave={b => api('/users', 'POST', b)} /><p className="muted">E-posta gönderilmez. Kullanıcı ilk girişte kendi parolasını belirler.</p></Editor>
    <Notice error={error} />{data?.map(user => <Editor key={user.id} title={`${user.name} · ${user.email} · ${user.isActive ? 'Aktif' : 'Pasif'}`}>
      {user.mustChangePassword && <p role="status">İlk girişte parola değişikliği bekleniyor.</p>}
      <FieldsForm fields={[{ name: 'name', label: 'Ad soyad', required: true }, { name: 'role', label: 'Rol', type: 'select', required: true, options: roles }, { name: 'isActive', label: 'Aktif hesap', type: 'checkbox' }]} initial={{ ...user }} onSave={b => api(`/users/${user.id}`, 'PATCH', b)} />
      {user.id === me.id ? <Link className="text-link" href="/change-password">Kendi parolamı değiştir</Link> : user.isActive && <Editor title="Parolayı sıfırla"><p>Mevcut oturumlar kapatılır. Kullanıcı bir sonraki girişte parolasını değiştirmek zorundadır.</p><FieldsForm label="Geçici parola ata" fields={[{ name: 'temporaryPassword', label: 'Yeni geçici parola', type: 'password', required: true, help: 'En az 12 karakter; kullanıcıya doğrudan iletin.' }]} onSave={b => api(`/users/${user.id}/password`, 'POST', b)} /></Editor>}
    </Editor>)}</>;
}
