'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { api, type Page } from '../../../lib/api';
import { knowledgeStatusLabels, type KnowledgePage } from '../../../lib/delivery';
import type { Product } from '../../../lib/sales';
import { Badge, Editor, Empty, Loading, Notice, Pager, Title, useData } from '../../../components/ui';
import KnowledgeForm from '../../../components/knowledge-form';
function Knowledge() {
  const params = useSearchParams(); const router = useRouter(); const productId = params.get('productId') ?? '';
  const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
  const { data, error, isLoading } = useData<KnowledgePage>(`/knowledge?page=${page}&search=${encodeURIComponent(search)}${category ? `&category=${encodeURIComponent(category)}` : ''}${productId ? `&productId=${productId}` : ''}`);
  const { data: products } = useData<Page<Product>>('/products?pageSize=100', !!data?.canEdit);
  return <><Title title="Bilgi bankası" subtitle="Onaylı ürün bilgisi: ne işe yarar, kime uygun, hangi sorular sorulur, itirazlara nasıl yanıt verilir." />
    {data?.canEdit && <Editor title="Yeni bilgi kartı"><KnowledgeForm meta={{ productId: productId || null }} products={products?.items} label="Taslak olarak oluştur" onSave={async ({ meta, content }) => { const row = await api<{ id: string }>('/knowledge', 'POST', { ...meta, content }); router.push(`/knowledge/${row.id}`); }} /></Editor>}
    <div className="toolbar"><label>Başlık, kategori veya etiket<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label><label>Kategori<select aria-label="Kategori" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}><option value="">Tümü</option>{data?.categories.map(c => <option key={c}>{c}</option>)}</select></label>{productId && <Link className="btn" href="/knowledge">Ürün filtresini kaldır</Link>}</div>
    <Notice error={error} />{isLoading && <Loading />}
    {data?.items.length === 0 && <Empty>{data.canEdit ? 'Henüz bilgi kartı yok. “Yeni bilgi kartı” ile ilk kartı oluşturun; yayınlandığında satış ekibi görür.' : 'Henüz yayınlanmış bilgi kartı yok.'}</Empty>}
    <div className="detail-grid">{data?.items.map(a => <section className="panel" key={a.id}><Badge>{a.category}</Badge>{a.retiredAt && <> <Badge>Yayından kaldırıldı</Badge></>}{a.openVersion && <> <Badge>{knowledgeStatusLabels[a.openVersion.status]} · V{a.openVersion.version}</Badge></>}<h2 className="mt-4"><Link className="text-link" href={`/knowledge/${a.id}`}>{a.title}</Link></h2>{a.product && <p className="muted">{a.product.sku} · {a.product.name}</p>}<p className="prewrap mt-3">{a.published?.summary ?? 'Henüz yayınlanmadı.'}</p>{!!a.tags.length && <p className="muted mt-3">#{a.tags.join(' #')}</p>}</section>)}</div>
    {data && <Pager page={page} total={data.total} setPage={setPage} />}</>;
}
export default function KnowledgePageRoute() { return <Suspense fallback={<Loading />}><Knowledge /></Suspense>; }
