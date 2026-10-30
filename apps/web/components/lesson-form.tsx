'use client';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { lessonSchema } from '@saleshub/shared';
import type { Lesson } from '../lib/delivery';
import { Notice } from './ui';

type Values = { title: string; body: string; articleId: string; passPct: number; questions: { prompt: string; options: string; correctIndex: string }[] };
const lines = (value: string) => value.split('\n').map(s => s.trim()).filter(Boolean);
function CorrectChoice({ control, index, register }: { control: ReturnType<typeof useForm<Values>>['control']; index: number; register: ReturnType<typeof useForm<Values>>['register'] }) {
  const options = lines(useWatch({ control, name: `questions.${index}.options` }) ?? '');
  return <label>Doğru seçenek<select aria-label="Doğru seçenek" {...register(`questions.${index}.correctIndex`)} required><option value="">Seçin</option>{options.map((o, i) => <option key={i} value={i}>{i + 1}. {o}</option>)}</select></label>;
}
/** Lesson editor for course managers; the answer key never leaves this role's screens. */
export default function LessonForm({ lesson, articles, onSave, label = 'Dersi kaydet' }: { lesson?: Lesson; articles: { id: string; title: string }[]; onSave: (value: unknown) => Promise<unknown>; label?: string }) {
  const [error, setError] = useState<unknown>(); const [saved, setSaved] = useState(false); const cache = useQueryClient();
  const { register, control, handleSubmit, reset, formState: { isSubmitting } } = useForm<Values>({ defaultValues: { title: lesson?.title ?? '', body: lesson?.body ?? '', articleId: lesson?.article?.id ?? '', passPct: lesson?.passPct ?? 80, questions: lesson?.questions.map(q => ({ prompt: q.prompt, options: q.options.join('\n'), correctIndex: String(q.correctIndex ?? '') })) ?? [] } });
  const questions = useFieldArray({ control, name: 'questions' });
  return <form onSubmit={handleSubmit(async v => {
    setError(undefined); setSaved(false);
    try {
      const parsed = lessonSchema.safeParse({ title: v.title, body: v.body, articleId: v.articleId || null, passPct: Number(v.passPct), questions: v.questions.map(q => ({ prompt: q.prompt, options: lines(q.options), correctIndex: Number(q.correctIndex) })) });
      if (!parsed.success) throw new Error('Her soruda 2–6 seçenek olmalı ve doğru seçenek işaretlenmeli; başarı eşiği 0–100 arası olmalı.');
      await onSave(parsed.data); setSaved(true); await cache.invalidateQueries(); if (!lesson) reset();
    } catch (e) { setError(e); }
  })}>
    <div className="form-grid"><label>Ders başlığı *<input {...register('title')} required maxLength={200} /></label><label>İlgili bilgi kartı<select aria-label="İlgili bilgi kartı" {...register('articleId')}><option value="">Yok</option>{articles.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
      <label className="wide">Ders içeriği *<textarea {...register('body')} required rows={6} maxLength={20000} /></label><label>Başarı eşiği (%)<input type="number" min={0} max={100} {...register('passPct')} required /><small className="muted">Testi geçmek için gereken en düşük puan.</small></label></div>
    <fieldset className="quote-line mb-4"><legend className="font-bold">Kısa test (isteğe bağlı)</legend>{questions.fields.length === 0 && <p className="muted">Soru yoksa ders “okudum” ile tamamlanır.</p>}
      {questions.fields.map((f, i) => <div className="form-grid" key={f.id}><label className="wide">Soru {i + 1}<input {...register(`questions.${i}.prompt`)} required maxLength={500} /></label><label>Seçenekler<textarea {...register(`questions.${i}.options`)} required rows={4} placeholder="Her satıra bir seçenek (2–6)" /></label><CorrectChoice control={control} index={i} register={register} /><button type="button" className="btn" onClick={() => questions.remove(i)}>Soruyu kaldır</button></div>)}
      <button type="button" className="btn" disabled={questions.fields.length >= 20} onClick={() => questions.append({ prompt: '', options: '', correctIndex: '' })}>+ Soru ekle</button></fieldset>
    <Notice error={error} />{saved && <p role="status" className="success">Kaydedildi.</p>}<button className="btn primary" disabled={isSubmitting}>{isSubmitting ? 'Kaydediliyor…' : label}</button>
  </form>;
}
