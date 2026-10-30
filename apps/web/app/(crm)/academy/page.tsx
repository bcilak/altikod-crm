'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, formatDate, type Page } from '../../../lib/api';
import { courseStatusLabels, type CourseListItem, type ProgressReport } from '../../../lib/delivery';
import type { Product } from '../../../lib/sales';
import { Badge, Editor, Empty, FieldsForm, Loading, Notice, Pager, Panel, Title, useData } from '../../../components/ui';
function Progress() {
  const { data, error, isLoading } = useData<ProgressReport>('/academy/progress');
  return <Panel title="Ekip ilerlemesi"><Notice error={error} />{isLoading && <Loading />}{data?.courses.length === 0 && <Empty>Yayında eğitim yok.</Empty>}
    {data?.courses.map(c => <div key={c.id} className="mb-6"><h3 className="font-bold">{c.title} · {c.lessonCount} ders</h3><div className="table-wrap"><table><thead><tr><th>Kişi</th><th>Tamamlanan</th><th>Son tamamlama</th></tr></thead><tbody>{c.learners.map(l => <tr key={l.userId}><td>{l.name}<small>{l.role}</small></td><td>{l.completed} / {c.lessonCount}{c.lessonCount > 0 && l.completed === c.lessonCount ? ' ✓' : ''}</td><td>{formatDate(l.lastCompletedAt ?? undefined)}</td></tr>)}</tbody></table></div></div>)}</Panel>;
}
export default function Academy() {
  const router = useRouter(); const [page, setPage] = useState(1);
  const { data, error, isLoading } = useData<Page<CourseListItem> & { canManage: boolean }>(`/courses?page=${page}`);
  const { data: products } = useData<Page<Product>>('/products?pageSize=100', !!data?.canManage);
  return <><Title title="Akademi" subtitle="Ürünleri ve satış yaklaşımını kısa derslerle öğrenin; ilerlemeniz kaydedilir." />
    {data?.canManage && <Editor title="Yeni eğitim"><FieldsForm fields={[{ name: 'title', label: 'Eğitim adı', required: true }, { name: 'description', label: 'Açıklama', type: 'textarea' }, { name: 'productId', label: 'İlgili ürün', type: 'select', nullable: true, options: products?.items.map(p => ({ value: p.id, label: `${p.sku} · ${p.name}` })) }]} label="Taslak olarak oluştur" onSave={async b => { const row = await api<{ id: string }>('/courses', 'POST', b); router.push(`/academy/${row.id}`); }} /></Editor>}
    <Notice error={error} />{isLoading && <Loading />}
    {data?.items.length === 0 && <Empty>{data.canManage ? 'Henüz eğitim yok. “Yeni eğitim” ile oluşturun, ders ekleyip yayınlayın.' : 'Henüz yayında eğitim yok.'}</Empty>}
    <div className="dashboard-links">{data?.items.map(c => <Link key={c.id} href={`/academy/${c.id}`} className="panel block"><h2>{c.title}</h2>{data.canManage && <Badge>{courseStatusLabels[c.status]}</Badge>}<p className="muted mt-3">{c.description || 'Açıklama yok.'}</p>{c.product && <p className="muted">{c.product.name}</p>}<p className="mt-3"><strong>{c.completedLessons} / {c.lessonCount}</strong> ders tamamlandı</p></Link>)}</div>
    {data && <Pager page={page} total={data.total} setPage={setPage} />}
    {data?.canManage && <Progress />}</>;
}
