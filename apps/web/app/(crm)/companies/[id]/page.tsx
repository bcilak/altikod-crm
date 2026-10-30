'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, formatDate, type Company, type Page, type Person, type Opportunity } from '../../../../lib/api';
import { Action, Badge, Editor, Empty, FieldsForm, Loading, Notice, Panel, Title, useData, useMe, options } from '../../../../components/ui';
import { RecordConversation } from '../../../../components/record-conversation';
import { activityFields, companyFields, contactFields, meetingFields, opportunityChoice, opportunityFields, personChoice, taskFields } from '../../../../components/crm-fields';
type Timeline = { items: { id: string; type: string; title: string; at: string; detail: string }[] };
export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>(); const { data: me } = useMe();
  const { data: company, error, isLoading } = useData<Company>(`/companies/${id}`);
  const { data: people } = useData<Person[]>('/companies/directory');
  const { data: timeline } = useData<Timeline>(`/companies/${id}/timeline`);
  const { data: opportunities } = useData<Page<Opportunity>>(`/opportunities?companyId=${id}&pageSize=100`);
  const { data: shares } = useData<{ userId: string; permission: string; user: Person }[]>(`/companies/${id}/shares`, !!company?.canShare);
  if (isLoading) return <Loading />; if (!company) return <Notice error={error} />;
  const write = company.canWrite; const oppChoice = opportunityChoice(opportunities?.items ?? []);
  return <><Link className="text-link" href="/companies">← Firmalar</Link><Title title={company.displayName} subtitle={`${company.legalName} · ${company.sector ?? 'Sektör belirtilmedi'}`}><Badge>{company.archivedAt ? 'Arşiv' : company.status}</Badge></Title>
    <div className="detail-grid"><div><Panel title="Firma bilgileri"><dl className="facts"><dt>Alan adı</dt><dd>{company.domain ?? '—'}</dd><dt>Telefon</dt><dd>{company.phone ?? '—'}</dd><dt>Adres</dt><dd>{company.address ?? '—'}</dd><dt>Etiketler</dt><dd>{company.tags.join(', ') || '—'}</dd></dl><p className="prewrap">{company.notes}</p></Panel>
      <Panel title="Kişiler">{!company.contacts?.length && <Empty>Henüz kişi eklenmedi.</Empty>}{company.contacts?.map(contact => <div className="record-block" key={contact.id}><strong>{contact.firstName} {contact.lastName}</strong>{contact.decisionMaker && <Badge>Karar verici</Badge>}<p>{contact.title} · {contact.email} · {contact.phone}</p>{write && <Editor title="Kişiyi düzenle"><FieldsForm fields={contactFields} initial={{ ...contact }} onSave={b => api(`/companies/${id}/contacts/${contact.id}`, 'PATCH', b)} /><Action confirm="Kişi arşivlensin mi?" run={() => api(`/companies/${id}/contacts/${contact.id}`, 'PATCH', { archived: true })}>Arşivle</Action></Editor>}</div>)}</Panel>
      <Panel title="Fırsatlar">{!opportunities?.items.length && <Empty />}{opportunities?.items.map(o => <p key={o.id}><Link className="text-link" href={`/opportunities/${o.id}`}>{o.title}</Link></p>)}</Panel>
      <RecordConversation recordType="COMPANY" recordId={id} />
      <Panel title="Zaman çizelgesi"><div className="timeline">{timeline?.items.map(t => <article key={`${t.type}-${t.id}`}><small>{formatDate(t.at)} · {t.type}</small><p className="prewrap">{t.title}</p><span className="muted">{t.detail}</span></article>)}{timeline?.items.length === 0 && <Empty>İlk faaliyeti kaydedin.</Empty>}</div></Panel>
    </div><div>{write && <>
      <Editor title="Firma bilgilerini düzenle"><FieldsForm fields={companyFields} initial={{ ...company }} onSave={b => api(`/companies/${id}`, 'PATCH', b)} /></Editor>
      <Editor title="Kişi ekle"><FieldsForm fields={contactFields} onSave={b => api(`/companies/${id}/contacts`, 'POST', b)} /></Editor>
      <Editor title="Görüşme kaydet"><FieldsForm fields={[...activityFields, oppChoice, { name: 'contactId', label: 'Görüşülen kişi', type: 'select', nullable: true, options: company.contacts?.map(c => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })) }]} onSave={b => api('/activities', 'POST', { ...b, companyId: id })} /><p className="muted">Bu kayıt manuel faaliyettir. Takip için aşağıdan görev oluşturun.</p></Editor>
      <Editor title="Takip görevi oluştur"><FieldsForm fields={[...taskFields, personChoice(people ?? []), oppChoice]} initial={{ assigneeId: me?.id, priority: 'NORMAL' }} onSave={b => api('/tasks', 'POST', { ...b, companyId: id })} /></Editor>
      <Editor title="Toplantı planla"><FieldsForm fields={[...meetingFields, oppChoice, { name: 'participantEmails', label: 'Harici katılımcı e-postaları', type: 'tags' }]} onSave={b => { const { participantEmails, ...rest } = b; return api('/meetings', 'POST', { ...rest, companyId: id, timezone: 'Europe/Istanbul', attendees: ((participantEmails as string[]) ?? []).map(externalEmail => ({ externalEmail })) }); }} /></Editor>
      <Editor title="Satış fırsatı aç"><FieldsForm fields={opportunityFields} initial={{ currency: 'TRY', probability: 10 }} onSave={b => api('/opportunities', 'POST', { ...b, companyId: id })} /></Editor>
    </>}{company.canShare && <><Editor title="Erişim ve paylaşım">{shares?.map(s => <p key={s.userId}>{s.user.name} · {s.permission} <Action run={() => api(`/companies/${id}/shares`, 'POST', { userId: s.userId, permission: 'NONE' })}>Kaldır</Action></p>)}{write && <FieldsForm fields={[{ name: 'userId', label: 'Kullanıcı', type: 'select', required: true, options: people?.filter(p => p.role !== 'TECHNICAL').map(p => ({ value: p.id, label: p.name })) }, { name: 'permission', label: 'Yetki', type: 'select', required: true, options: options({ READ: 'Okuma', WRITE: 'Düzenleme' }) }]} onSave={b => api(`/companies/${id}/shares`, 'POST', b)} />}</Editor><Action confirm={company.archivedAt ? 'Firma yeniden etkinleştirilsin mi?' : 'Firma arşivlensin mi? Bağlı kayıtlar korunacak.'} run={() => api(`/companies/${id}/archive`, 'POST', { archived: !company.archivedAt })}>{company.archivedAt ? 'Arşivden çıkar' : 'Firmayı arşivle'}</Action></>}{write && ['ADMIN', 'MANAGER'].includes(me?.role ?? '') && <Editor title="Firma sorumlusunu değiştir"><FieldsForm fields={[personChoice((people ?? []).filter(p => p.role !== 'TECHNICAL'), 'ownerId')]} initial={{ ownerId: company.ownerId }} onSave={b => api(`/companies/${id}`, 'PATCH', b)} /></Editor>}</div></div></>;
}
