'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, type Company, type Page } from '../../../lib/api';
import { companyFields } from '../../../components/crm-fields';
import { Badge, Editor, Empty, FieldsForm, Loading, Notice, Pager, Title, useData, useMe } from '../../../components/ui';
export default function Companies() {
  const [search, setSearch] = useState(''); const [archived, setArchived] = useState(false); const [page, setPage] = useState(1); const [created, setCreated] = useState<Company>(); const { data: me } = useMe();
  const { data, error, isLoading } = useData<Page<Company>>(`/companies?search=${encodeURIComponent(search)}&archived=${archived}&page=${page}`);
  return <><Title title="Firmalar" subtitle="Müşteri ilişkileri, kişiler ve tüm satış geçmişi." />{me?.role !== 'VIEWER' && <Editor title="Yeni firma"><FieldsForm fields={companyFields} onSave={async b => { setCreated(await api<Company>('/companies', 'POST', b)); }} />{created && <p className="notice"><Link href={`/companies/${created.id}`}>{created.displayName} kaydını aç →</Link>{!!created.duplicateWarnings?.length && <span> · Benzer kayıtlar: {created.duplicateWarnings.map(c => c.displayName).join(', ')}</span>}</p>}</Editor>}
    <div className="toolbar"><label>Firma ara<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Firma, unvan veya alan adı" /></label><label className="check-label"><input type="checkbox" checked={archived} onChange={e => { setArchived(e.target.checked); setPage(1); }} />Arşivlenenler</label></div><Notice error={error} />{isLoading && <Loading />}{data?.items.length === 0 && <Empty>Filtrelere uygun firma yok.</Empty>}
    <div className="table-wrap"><table><thead><tr><th>Firma</th><th>Sektör</th><th>Sorumlu</th><th>Durum</th></tr></thead><tbody>{data?.items.map(c => <tr key={c.id}><td><Link className="text-link" href={`/companies/${c.id}`}>{c.displayName}</Link><small>{c.domain ?? c.legalName}</small></td><td>{c.sector ?? '—'}</td><td>{c.owner?.name}</td><td><Badge>{c.status}</Badge></td></tr>)}</tbody></table></div>{data && <Pager page={page} total={data.total} setPage={setPage} />}</>;
}
