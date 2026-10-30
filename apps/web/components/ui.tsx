'use client';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, inputDate, type Me } from '../lib/api';
export function useData<T>(path: string, enabled = true) { return useQuery({ queryKey: [path], queryFn: () => api<T>(path), enabled, retry: false }); }
export function useMe() { return useQuery<Me>({ queryKey: ['/auth/me'], queryFn: () => api<Me>('/auth/me'), retry: false }); }
export function Notice({ error }: { error: unknown }) { return error ? <p role="alert" className="notice error">{error instanceof Error ? error.message : String(error)}</p> : null; }
export function Loading() { return <p role="status" className="muted py-6">Yükleniyor…</p>; }
export function Empty({ children = 'Henüz kayıt yok.' }: { children?: ReactNode }) { return <p className="empty">{children}</p>; }
export function Title({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) { return <div className="page-title"><div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div><div className="title-shapes" aria-hidden="true"><i /><i /><i /></div>{children}</div>; }
export function Badge({ children }: { children: ReactNode }) { return <span className="badge">{children}</span>; }
export type Field = { name: string; label: string; type?: 'text' | 'email' | 'password' | 'number' | 'datetime-local' | 'textarea' | 'select' | 'checkbox' | 'tags'; required?: boolean; options?: { value: string; label: string }[]; min?: number; max?: number; help?: string; nullable?: boolean };
export function FieldsForm({ fields, initial = {}, onSave, label = 'Kaydet', children }: { fields: Field[]; initial?: Record<string, unknown>; onSave: (value: Record<string, unknown>) => Promise<unknown>; label?: string; children?: ReactNode }) {
  const defaults = Object.fromEntries(fields.map(f => [f.name, f.type === 'datetime-local' ? inputDate(initial[f.name] as string) : f.type === 'tags' ? (initial[f.name] as string[] | undefined)?.join(', ') ?? '' : initial[f.name] ?? (f.type === 'checkbox' ? false : '')]));
  const { register, handleSubmit, formState: { isSubmitting }, reset } = useForm<Record<string, unknown>>({ defaultValues: defaults });
  const [error, setError] = useState<unknown>(); const [success, setSuccess] = useState(false); const cache = useQueryClient();
  return <form className="fields-form" onSubmit={handleSubmit(async values => {
    setError(undefined); setSuccess(false);
    try {
      const payload: Record<string, unknown> = {};
      for (const f of fields) { const value = values[f.name]; if (value === '' || value === undefined) { if (f.nullable) payload[f.name] = null; continue; }
        payload[f.name] = f.type === 'number' ? Number(value) : f.type === 'datetime-local' ? new Date(`${value}:00+03:00`).toISOString() : f.type === 'tags' ? String(value).split(',').map(s => s.trim()).filter(Boolean) : value; }
      await onSave(payload); setSuccess(true); await cache.invalidateQueries(); if (!Object.keys(initial).length) reset();
    } catch (e) { setError(e); }
  })}><div className="form-grid">{fields.map(f => <label key={f.name} className={f.type === 'textarea' ? 'wide' : ''}><span>{f.label}{f.required ? ' *' : ''}</span>
    {f.type === 'select' ? <select aria-label={f.label} {...register(f.name)} required={f.required}><option value="">Seçin</option>{f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : f.type === 'textarea' ? <textarea aria-label={f.label} {...register(f.name)} required={f.required} rows={3} maxLength={5000} /> : <input aria-label={f.label} {...register(f.name)} type={f.type === 'tags' ? 'text' : f.type ?? 'text'} required={f.required} min={f.min} max={f.max} autoComplete={f.type === 'password' ? 'new-password' : undefined} />}{f.help && <small className="muted">{f.help}</small>}</label>)}</div>
    {children}<Notice error={error} />{success && <p role="status" className="success">İşlem tamamlandı.</p>}<button className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Kaydediliyor…' : label}</button></form>;
}
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
export function Editor({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) { return <details className="panel editor" open={open || undefined}><summary>{title}</summary><div className="pt-4">{children}</div></details>; }
export function Pager({ page, total, setPage, size = 25 }: { page: number; total: number; setPage: (n: number) => void; size?: number }) { return <div className="pager"><span>{total} kayıt · Sayfa {page}</span><button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Önceki</button><button className="btn" disabled={page * size >= total} onClick={() => setPage(page + 1)}>Sonraki</button></div>; }
export function Action({ children, run, confirm }: { children: ReactNode; run: () => Promise<unknown>; confirm?: string }) {
  const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false); const cache = useQueryClient();
  return <span><button className="btn" disabled={busy} onClick={async () => { if (confirm && !window.confirm(confirm)) return; setBusy(true); setError(undefined); try { await run(); await cache.invalidateQueries(); } catch (e) { setError(e); } finally { setBusy(false); } }}>{children}</button><Notice error={error} /></span>;
}
export const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));
