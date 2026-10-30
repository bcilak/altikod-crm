'use client';
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { quoteCreateSchema, quoteEditSchema } from '@saleshub/shared';
import { api, inputDate, type Opportunity, type Page } from '../lib/api';
import { type Product, type Quote, type QuoteVersion } from '../lib/sales';
import { Notice, useData } from './ui';
type FormValues = { opportunityId: string; title: string; currency: string; validUntil: string; terms: string; discountPct: string; items: { productId: string; description: string; quantity: string; unitPrice: string; discountPct: string; taxPct: string; unitCost?: string }[] };
const blank = { productId: '', description: '', quantity: '1', unitPrice: '0', discountPct: '0', taxPct: '20' };
export default function QuoteForm({ quote, version, finance = false, onSaved }: { quote?: Quote; version?: QuoteVersion; finance?: boolean; onSaved: (quote: Quote) => void }) {
  const [error, setError] = useState<unknown>(); const cache = useQueryClient();
  const { data: opportunities } = useData<Page<Opportunity>>('/opportunities?pageSize=100'); const { data: products } = useData<Page<Product>>('/products?pageSize=100&status=APPROVED');
  const { register, control, handleSubmit, setValue, watch, formState: { isSubmitting } } = useForm<FormValues>({ defaultValues: { opportunityId: quote?.opportunityId ?? '', title: version?.title ?? '', currency: version?.currency ?? 'TRY', validUntil: inputDate(version?.validUntil ?? new Date(Date.now() + 30 * 86400_000).toISOString()), terms: version?.terms ?? '', discountPct: version?.discountPct ?? '0', items: version?.items.map(i => ({ productId: i.productId ?? '', description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, discountPct: i.discountPct, taxPct: i.taxPct, ...(finance ? { unitCost: i.unitCost ?? '' } : {}) })) ?? [blank] } });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' }); const selectedCurrency = watch('currency');
  return <form onSubmit={handleSubmit(async values => {
    setError(undefined);
    try {
      const { opportunityId, ...content } = values;
      const body = { ...content, validUntil: new Date(`${values.validUntil}:00+03:00`).toISOString(), items: values.items.map(i => ({ ...i, productId: i.productId || null, ...(finance ? { unitCost: i.unitCost || null } : {}) })) };
      const payload = version ? quoteEditSchema.parse({ ...body, lockVersion: version.lockVersion }) : quoteCreateSchema.parse({ ...body, opportunityId });
      const result = await api<Quote>(version ? `/quote-versions/${version.id}` : '/quotes', version ? 'PATCH' : 'POST', payload);
      await cache.invalidateQueries(); onSaved(result);
    } catch (e) { setError(e); }
  })}>
    <div className="form-grid">{!quote && <label>Fırsat<select aria-label="Fırsat" {...register('opportunityId')} required><option value="">Seçin</option>{opportunities?.items.filter(o => !['WON', 'LOST'].includes(o.stage)).map(o => <option key={o.id} value={o.id}>{o.title} · {o.company?.displayName}</option>)}</select></label>}<label>Teklif başlığı<input {...register('title')} required maxLength={200} /></label><label>Para birimi<select aria-label="Para birimi" {...register('currency')}>{['TRY', 'USD', 'EUR', 'GBP'].map(c => <option key={c}>{c}</option>)}</select></label><label>Geçerlilik (İstanbul)<input {...register('validUntil')} type="datetime-local" required /></label><label>Teklif indirimi (%)<input {...register('discountPct')} inputMode="decimal" required /></label></div>
    <div className="quote-lines">{fields.map((field, index) => <section className="quote-line" key={field.id}><h3>{String(index + 1).padStart(2, '0')} / Teklif kalemi</h3><div className="form-grid"><label>Katalog ürünü<select aria-label="Katalog ürünü" {...register(`items.${index}.productId`)} onChange={e => { setValue(`items.${index}.productId`, e.target.value); const product = products?.items.find(p => p.id === e.target.value); if (product) { setValue(`items.${index}.description`, `${product.name}\n${product.description}`); setValue(`items.${index}.unitPrice`, product.listPrice); if (finance) setValue(`items.${index}.unitCost`, product.cost ?? ''); } }}><option value="">Serbest kalem</option>{products?.items.filter(p => p.currency === selectedCurrency).map(p => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></label><label>Açıklama<textarea {...register(`items.${index}.description`)} required maxLength={2000} /></label><label>Miktar<input {...register(`items.${index}.quantity`)} inputMode="decimal" required /></label><label>Birim fiyat<input {...register(`items.${index}.unitPrice`)} inputMode="decimal" required /></label><label>Kalem indirimi (%)<input {...register(`items.${index}.discountPct`)} inputMode="decimal" required /></label><label>KDV (%)<input {...register(`items.${index}.taxPct`)} inputMode="decimal" required /></label>{finance && <label>Birim maliyet<input {...register(`items.${index}.unitCost`)} inputMode="decimal" placeholder="Bilinmiyorsa boş bırakın" /></label>}</div><button type="button" className="btn" disabled={fields.length === 1} onClick={() => remove(index)}>Kalemi kaldır</button></section>)}</div>
    <div className="quote-actions"><button className="btn" type="button" disabled={fields.length >= 100} onClick={() => append(blank)}>+ Kalem ekle</button></div><label>Teklif şartları<textarea {...register('terms')} rows={5} maxLength={10000} /></label><p className="muted mt-3">Hesaplar sunucuda yapılır. İndirimler kalemlere dağıtılır; KDV indirim sonrası tutara uygulanır. Ondalık ayıracı nokta kullanın.</p><Notice error={error} /><button className="btn primary mt-5" disabled={isSubmitting}>{isSubmitting ? 'Kaydediliyor…' : 'Taslağı kaydet'}</button>
  </form>;
}
