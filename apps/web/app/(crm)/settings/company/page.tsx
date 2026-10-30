'use client';
import { api } from '../../../../lib/api';
import { Editor, FieldsForm, Notice, Title, useData, useMe } from '../../../../components/ui';
type Settings = { sellerName: string; sellerAddress: string; sellerEmail: string; defaultTerms: string; autoApproval: boolean; maxDiscountPct: string; minMarginPct: string; revision: number };
export default function CompanySettings() {
  const { data: me } = useMe(); const { data, error } = useData<Settings>('/settings/sales', me?.role === 'ADMIN');
  if (me?.role !== 'ADMIN') return <Notice error="Şirket ve onay ayarları yalnız ADMIN tarafından değiştirilir." />;
  return <><Title title="Şirket & teklif ayarları" subtitle="Yeni teklif sürümlerine kopyalanacak bilgiler ve onay politikası." /><Notice error={error} />{data && <Editor title="Şirket bilgileri ve onay eşikleri" open><FieldsForm key={data.revision} initial={{ ...data }} fields={[{ name: 'sellerName', label: 'Şirket / satıcı unvanı', required: true }, { name: 'sellerEmail', label: 'İletişim e-postası', type: 'email' }, { name: 'sellerAddress', label: 'Adres', type: 'textarea' }, { name: 'defaultTerms', label: 'Varsayılan teklif şartları', type: 'textarea' }, { name: 'autoApproval', label: 'Eşik içindeki teklifleri otomatik onayla', type: 'checkbox' }, { name: 'maxDiscountPct', label: 'En yüksek indirim (%)', required: true }, { name: 'minMarginPct', label: 'En düşük marj (%)', required: true }]} onSave={b => api('/settings/sales', 'PATCH', { sellerAddress: '', sellerEmail: '', defaultTerms: '', ...b, revision: data.revision })} /><p className="muted">Otomatik onay varsayılan olarak kapalıdır. Eksik maliyetli teklif daima yönetici onayı ister. Değişiklikler geçmiş teklif sürümlerini etkilemez.</p></Editor>}</>;
}
