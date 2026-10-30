'use client';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { knowledgeContentSchema } from '@saleshub/shared';
import type { KnowledgeContent } from '../lib/delivery';
import { Notice } from './ui';

type Values = Omit<KnowledgeContent, 'discoveryQuestions'> & { discoveryQuestions: string; title: string; category: string; tags: string; productId: string };
export type KnowledgeSubmit = { meta: { title: string; category: string; tags: string[]; productId: string | null }; content: KnowledgeContent };
const text: [keyof KnowledgeContent, string, string][] = [
  ['technicalSpecs', 'Teknik özellikler', 'Kapasite, performans, uyumluluk…'], ['useCases', 'Kullanım alanları', 'Hangi problemi çözer?'], ['idealCustomer', 'İdeal müşteri', 'Sektör, ölçek, mevcut altyapı'],
  ['salesPitch', 'Satış cümlesi', 'Müşteriye tek paragrafta nasıl anlatılır?'], ['limitations', 'Kısıtlar', 'Desteklenmeyen senaryolar, ön koşullar'],
];
/** Content editor for a knowledge draft. With `meta`, also edits article title/category/tags/product (new card). */
export default function KnowledgeForm({ initial, meta, products, onSave, label = 'Taslağı kaydet' }: { initial?: Partial<KnowledgeContent>; meta?: { title?: string; category?: string; tags?: string[]; productId?: string | null }; products?: { id: string; name: string; sku: string }[]; onSave: (value: KnowledgeSubmit) => Promise<unknown>; label?: string }) {
  const [error, setError] = useState<unknown>(); const [saved, setSaved] = useState(false); const cache = useQueryClient();
  const { register, control, handleSubmit, formState: { isSubmitting } } = useForm<Values>({ defaultValues: {
    title: meta?.title ?? '', category: meta?.category ?? '', tags: meta?.tags?.join(', ') ?? '', productId: meta?.productId ?? '',
    summary: initial?.summary ?? '', productVersion: initial?.productVersion ?? '', technicalSpecs: initial?.technicalSpecs ?? '', useCases: initial?.useCases ?? '', idealCustomer: initial?.idealCustomer ?? '', salesPitch: initial?.salesPitch ?? '', limitations: initial?.limitations ?? '',
    discoveryQuestions: initial?.discoveryQuestions?.join('\n') ?? '', objections: initial?.objections ?? [], faq: initial?.faq ?? [],
  } });
  const objections = useFieldArray({ control, name: 'objections' }); const faq = useFieldArray({ control, name: 'faq' });
  return <form onSubmit={handleSubmit(async v => {
    setError(undefined); setSaved(false);
    try {
      const parsed = knowledgeContentSchema.safeParse({ summary: v.summary, productVersion: v.productVersion || null, technicalSpecs: v.technicalSpecs, useCases: v.useCases, idealCustomer: v.idealCustomer, salesPitch: v.salesPitch, limitations: v.limitations,
        discoveryQuestions: v.discoveryQuestions.split('\n').map(s => s.trim()).filter(Boolean), objections: v.objections, faq: v.faq });
      if (!parsed.success) throw new Error('Lütfen zorunlu alanları doldurun; itiraz ve SSS satırlarında iki alan da dolu olmalı.');
      await onSave({ meta: { title: v.title.trim(), category: v.category.trim(), tags: v.tags.split(',').map(s => s.trim()).filter(Boolean), productId: v.productId || null }, content: parsed.data });
      setSaved(true); await cache.invalidateQueries();
    } catch (e) { setError(e); }
  })}>
    {meta && <div className="form-grid"><label>Kart başlığı *<input {...register('title')} required maxLength={200} /></label><label>Kategori *<input {...register('category')} required maxLength={100} placeholder="Ör. Ağ güvenliği" /></label><label>Etiketler<input {...register('tags')} placeholder="Virgülle ayırın" /></label><label>Bağlı ürün<select aria-label="Bağlı ürün" {...register('productId')}><option value="">Ürüne bağlı değil</option>{products?.map(p => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label></div>}
    <div className="form-grid"><label className="wide">Kısa özet *<textarea {...register('summary')} required maxLength={2000} rows={3} /></label><label>Ürün sürümü<input {...register('productVersion')} maxLength={100} placeholder="Ör. v7.2" /></label>
      {text.map(([name, title, hint]) => <label key={name} className="wide">{title}<textarea {...register(name as keyof Values)} rows={3} placeholder={hint} /></label>)}
      <label className="wide">İhtiyaç keşif soruları<textarea {...register('discoveryQuestions')} rows={4} placeholder="Her satıra bir soru yazın" /><small className="muted">Her satır ayrı bir soru olarak kaydedilir.</small></label></div>
    <fieldset className="quote-line mb-4"><legend className="font-bold">İtiraz yanıtları</legend>{objections.fields.map((f, i) => <div className="form-grid" key={f.id}><label>İtiraz<input {...register(`objections.${i}.objection`)} required maxLength={1000} /></label><label>Önerilen yanıt<textarea {...register(`objections.${i}.answer`)} required rows={2} maxLength={3000} /></label><button type="button" className="btn" onClick={() => objections.remove(i)}>Bu itirazı kaldır</button></div>)}<button type="button" className="btn" disabled={objections.fields.length >= 40} onClick={() => objections.append({ objection: '', answer: '' })}>+ İtiraz ekle</button></fieldset>
    <fieldset className="quote-line mb-4"><legend className="font-bold">Sık sorulan sorular</legend>{faq.fields.map((f, i) => <div className="form-grid" key={f.id}><label>Soru<input {...register(`faq.${i}.question`)} required maxLength={1000} /></label><label>Yanıt<textarea {...register(`faq.${i}.answer`)} required rows={2} maxLength={3000} /></label><button type="button" className="btn" onClick={() => faq.remove(i)}>Bu soruyu kaldır</button></div>)}<button type="button" className="btn" disabled={faq.fields.length >= 40} onClick={() => faq.append({ question: '', answer: '' })}>+ Soru ekle</button></fieldset>
    <Notice error={error} />{saved && <p role="status" className="success">Kaydedildi.</p>}<button className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Kaydediliyor…' : label}</button>
  </form>;
}
