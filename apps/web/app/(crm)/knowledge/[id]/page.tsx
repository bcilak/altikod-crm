'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, formatDate, upload, type Page } from '../../../../lib/api';
import { fileSize, knowledgeStatusLabels, type KnowledgeArticle, type KnowledgeVersion } from '../../../../lib/delivery';
import type { Product } from '../../../../lib/sales';
import { Action, Badge, Editor, Empty, FieldsForm, Loading, Notice, Panel, Title, useData } from '../../../../components/ui';
import KnowledgeForm from '../../../../components/knowledge-form';

function Content({ v }: { v: KnowledgeVersion }) {
  const block = (title: string, body: string) => body ? <Panel title={title}><p className="prewrap">{body}</p></Panel> : null;
  return <>{block('Teknik özellikler', v.technicalSpecs)}{block('Kullanım alanları', v.useCases)}{block('İdeal müşteri', v.idealCustomer)}{block('Satış cümlesi', v.salesPitch)}
    {!!v.discoveryQuestions.length && <Panel title="İhtiyaç keşif soruları"><ol className="list-decimal pl-6">{v.discoveryQuestions.map((q, i) => <li key={i}>{q}</li>)}</ol></Panel>}
    {!!v.objections.length && <Panel title="İtiraz yanıtları">{v.objections.map((o, i) => <div className="record-block" key={i}><strong>“{o.objection}”</strong><p className="prewrap">{o.answer}</p></div>)}</Panel>}
    {!!v.faq.length && <Panel title="Sık sorulan sorular">{v.faq.map((f, i) => <div className="record-block" key={i}><strong>{f.question}</strong><p className="prewrap">{f.answer}</p></div>)}</Panel>}
    {block('Kısıtlar', v.limitations)}</>;
}
function Attachments({ a }: { a: KnowledgeArticle }) {
  const input = useRef<HTMLInputElement>(null); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false); const cache = useQueryClient();
  return <Panel title="Dosyalar">{a.attachments.length === 0 && <Empty>Ekli dosya yok.</Empty>}
    {a.attachments.map(f => <div className="record" key={f.id}><div><a className="text-link" href={`/api/v1/knowledge-attachments/${f.id}`}>{f.name}</a><small className="muted block">{f.mimeType === 'application/pdf' ? 'PDF' : 'Görsel'} · {fileSize(f.size)}</small></div>{a.canEdit && <Action confirm={`“${f.name}” kaldırılsın mı?`} run={() => api(`/knowledge-attachments/${f.id}/remove`, 'POST')}>Kaldır</Action>}</div>)}
    {a.canEdit && <div className="mt-4"><label>Dosya ekle (PDF, PNG, JPEG · en fazla 5 MB)<input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" className="file-input" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return; setError(undefined); setBusy(true);
      try { if (file.size > 5 * 1024 * 1024) throw new Error('Dosya en fazla 5 MB olabilir'); await upload(`/knowledge/${a.id}/attachments`, file); await cache.invalidateQueries(); } catch (err) { setError(err); } finally { setBusy(false); if (input.current) input.current.value = ''; }
    }} /></label>{busy && <p role="status" className="muted">Yükleniyor…</p>}<Notice error={error} /><small className="muted">Dosyalar kartla birlikte görünür: kart yayındayken satış ekibi indirebilir.</small></div>}</Panel>;
}
function Workflow({ a }: { a: KnowledgeArticle }) {
  const v = a.openVersion; const act = (action: string, note?: string) => api(`/knowledge-versions/${v!.id}/${action}`, 'POST', { lockVersion: v!.lockVersion, ...(note ? { note } : {}) });
  return <Panel title="Yayın akışı">{!v ? <><p className="muted">Açık taslak yok. Yayındaki içeriği değiştirmek için yeni bir sürüm başlatın; yayınlanana kadar satış ekibi eski sürümü görür.</p><Action run={() => api(`/knowledge/${a.id}/versions`, 'POST')}>Yeni sürüm başlat</Action></> : <>
    <p><Badge>{knowledgeStatusLabels[v.status]}</Badge> Sürüm {v.version}</p>{v.reviewNote && v.status === 'DRAFT' && <p className="notice error">İnceleme notu: {v.reviewNote}</p>}
    <div className="quote-actions">{v.status === 'DRAFT' && <Action run={() => act('submit')}>İncelemeye gönder</Action>}{v.status === 'IN_REVIEW' && a.canPublish && <Action confirm="Bu sürüm yayınlanacak ve satış ekibi görecek. Yayınlanan içerik değiştirilemez. Devam edilsin mi?" run={() => act('publish')}>Onayla ve yayınla</Action>}</div>
    {v.status === 'IN_REVIEW' && !a.canPublish && <p className="muted">Yönetici onayı bekleniyor.</p>}
    {v.status === 'IN_REVIEW' && a.canPublish && <Editor title="Düzeltme için geri gönder"><FieldsForm fields={[{ name: 'note', label: 'Gerekçe', type: 'textarea', required: true }]} label="Geri gönder" onSave={b => act('reject', String(b.note))} /></Editor>}</>}
    {a.canPublish && <div className="mt-4">{a.retiredAt ? <Action run={() => api(`/knowledge/${a.id}/restore`, 'POST')}>Yeniden yayına al</Action> : a.published && <Action confirm="Kart satış ekibinden gizlenecek. Devam edilsin mi?" run={() => api(`/knowledge/${a.id}/retire`, 'POST')}>Yayından kaldır</Action>}</div>}</Panel>;
}
export default function KnowledgeDetail() {
  const { id } = useParams<{ id: string }>(); const { data: a, error, isLoading } = useData<KnowledgeArticle>(`/knowledge/${id}`);
  const { data: products } = useData<Page<Product>>('/products?pageSize=100', !!a?.canEdit);
  if (isLoading) return <Loading />; if (!a) return <><Link className="text-link" href="/knowledge">← Bilgi bankası</Link><Notice error={error ?? 'Bilgi kartı bulunamadı.'} /></>;
  const shown = a.published ?? (a.canEdit ? a.openVersion : null);
  return <><Link className="text-link" href="/knowledge">← Bilgi bankası</Link><Title title={a.title} subtitle={`${a.category}${a.product ? ` · ${a.product.name}` : ''}${a.published ? ` · Sürüm ${a.published.version}, ${formatDate(a.published.publishedAt ?? undefined)}` : ''}`} />
    {a.retiredAt && <p className="notice">Bu kart yayından kaldırıldı; satış ekibi göremez.</p>}{a.canEdit && !a.published && <p className="notice">Henüz yayınlanmadı. Aşağıda taslak içerik gösteriliyor.</p>}
    <div className="detail-grid"><div>{shown ? <><Panel title="Özet"><p className="prewrap">{shown.summary}</p>{shown.productVersion && <p className="muted">Ürün sürümü: {shown.productVersion}</p>}{!!a.tags.length && <p className="muted">#{a.tags.join(' #')}</p>}</Panel><Content v={shown} /></> : <Empty>İçerik yok.</Empty>}</div>
      <div><Attachments a={a} />{a.canEdit && <><Workflow a={a} />
        {a.openVersion?.status === 'DRAFT' && <Editor title={`Taslağı düzenle (sürüm ${a.openVersion.version})`}><KnowledgeForm key={a.openVersion.lockVersion} initial={a.openVersion} onSave={({ content }) => api(`/knowledge-versions/${a.openVersion!.id}`, 'PATCH', { ...content, lockVersion: a.openVersion!.lockVersion })} /></Editor>}
        <Editor title="Kart bilgileri"><FieldsForm key={a.updatedAt} fields={[{ name: 'title', label: 'Kart başlığı', required: true }, { name: 'category', label: 'Kategori', required: true }, { name: 'tags', label: 'Etiketler', type: 'tags', help: 'Virgülle ayırın' }, { name: 'productId', label: 'Bağlı ürün', type: 'select', nullable: true, options: products?.items.map(p => ({ value: p.id, label: `${p.sku} · ${p.name}` })) }]} initial={{ title: a.title, category: a.category, tags: a.tags, productId: a.product?.id ?? '' }} onSave={b => api(`/knowledge/${id}`, 'PATCH', b)} /></Editor>
        <Panel title="Sürüm geçmişi">{a.history?.map(h => <div className="record" key={h.id}><span>Sürüm {h.version}</span><span className="muted">{h.publishedAt ? formatDate(h.publishedAt) : formatDate(h.createdAt)}</span><Badge>{knowledgeStatusLabels[h.status]}</Badge></div>)}</Panel></>}</div></div></>;
}
