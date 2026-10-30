'use client';
import { api, type Person } from '../../../../lib/api';
import { Editor, FieldsForm, Notice, Title, useData, useMe, options } from '../../../../components/ui';
const roles = options({ ADMIN: 'Yönetici (ADMIN)', MANAGER: 'Satış yöneticisi', SALES: 'Satış', TECHNICAL: 'Teknik', VIEWER: 'Görüntüleyici' });
export default function Users() {
  const { data: me } = useMe(); const { data, error } = useData<(Person & { email: string; isActive: boolean })[]>('/users', me?.role === 'ADMIN');
  if (me?.role !== 'ADMIN') return <Notice error="Bu sayfa yalnız yöneticiler içindir." />;
  return <><Title title="Kullanıcı yönetimi" subtitle="Davetler, roller ve hesap durumu." /><Editor title="Kullanıcı davet et" open><FieldsForm fields={[{ name: 'name', label: 'Ad soyad', required: true }, { name: 'email', label: 'E-posta', type: 'email', required: true }, { name: 'role', label: 'Rol', type: 'select', required: true, options: roles }]} onSave={b => api('/users/invitations', 'POST', b)} /><p className="muted">Yerel adaptör: davet bağlantısı sunucudaki .local-mail klasörüne yazılır. Dış e-posta gönderilmez.</p></Editor><Notice error={error} />{data?.map(user => <Editor key={user.id} title={`${user.name} · ${user.email} · ${user.isActive ? 'Aktif' : 'Pasif'}`}><FieldsForm fields={[{ name: 'name', label: 'Ad soyad', required: true }, { name: 'role', label: 'Rol', type: 'select', required: true, options: roles }, { name: 'isActive', label: 'Aktif hesap', type: 'checkbox' }]} initial={{ ...user }} onSave={b => api(`/users/${user.id}`, 'PATCH', b)} /></Editor>)}</>;
}
