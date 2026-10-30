'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatDate, type Page } from '../../../lib/api';
import { projectStatusLabels, type ProjectListItem } from '../../../lib/delivery';
import { Badge, Empty, Loading, Notice, Pager, Title, useData } from '../../../components/ui';
export default function Projects() {
  const [page, setPage] = useState(1); const [status, setStatus] = useState(''); const [search, setSearch] = useState('');
  const { data, error, isLoading } = useData<Page<ProjectListItem>>(`/projects?page=${page}&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}`);
  return <><Title title="Projeler" subtitle="Kazanılan işlerin teslimatı: kilometre taşları, görevler ve durum." />
    <div className="toolbar"><label>Projede ara<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><label>Durum<select aria-label="Durum" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Tümü</option>{Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    <Notice error={error} />{isLoading && <Loading />}
    {data?.items.length === 0 && <Empty>Henüz proje yok. Projeler, <Link className="text-link" href="/handoffs">İş devri</Link> ekranında kazanılan bir fırsat devredildiğinde otomatik açılır.</Empty>}
    {!!data?.items.length && <div className="table-wrap"><table><thead><tr><th>Proje</th><th>Durum</th><th>Sorumlu</th><th>Kilometre taşı</th><th>Açık görev</th><th>Hedef teslim</th></tr></thead><tbody>{data.items.map(p => <tr key={p.id}><td><Link className="text-link" href={`/projects/${p.id}`}>{p.title}</Link><small>{p.company.displayName}</small></td><td><Badge>{projectStatusLabels[p.status as keyof typeof projectStatusLabels]}</Badge></td><td>{p.owner.name}</td><td>{p.milestones.done} / {p.milestones.total}</td><td>{p.openTasks}</td><td>{formatDate(p.dueAt)}</td></tr>)}</tbody></table></div>}
    {data && <Pager page={page} total={data.total} setPage={setPage} />}</>;
}
