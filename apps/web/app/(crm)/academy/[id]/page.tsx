'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../../lib/api';
import { courseStatusLabels, type Course, type KnowledgePage, type Lesson } from '../../../../lib/delivery';
import { Action, Badge, Editor, Empty, Loading, Notice, Panel, Title, useData } from '../../../../components/ui';
import LessonForm from '../../../../components/lesson-form';

type Result = { score: number; passed: boolean; passPct: number; attempts: number; completed: boolean };
function Quiz({ lesson }: { lesson: Lesson }) {
  const [answers, setAnswers] = useState<Record<number, number>>({}); const [result, setResult] = useState<Result>(); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false); const cache = useQueryClient();
  const done = lesson.progress?.completedAt; const count = lesson.questions.length;
  const submit = async () => { setBusy(true); setError(undefined); try { setResult(await api<Result>(`/lessons/${lesson.id}/attempts`, 'POST', { answers: lesson.questions.map((_, i) => answers[i]) })); await cache.invalidateQueries(); } catch (e) { setError(e); } finally { setBusy(false); } };
  if (!count) return <div className="quote-actions">{done ? <Badge>✓ Tamamlandı</Badge> : <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Kaydediliyor…' : 'Okudum, tamamla'}</button>}<Notice error={error} /></div>;
  return <form onSubmit={e => { e.preventDefault(); void submit(); }}>{lesson.questions.map((q, i) => <fieldset key={q.id} className="quote-line mb-4"><legend className="font-bold">{i + 1}. {q.prompt}</legend>{q.options.map((o, j) => <label key={j} className="quiz-option"><input type="radio" name={`${lesson.id}-${i}`} checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} required /> {o}</label>)}</fieldset>)}
    <Notice error={error} />{result && <p role="status" className={result.passed ? 'success' : 'notice error'}>Puanınız %{result.score}. {result.passed ? 'Tebrikler, ders tamamlandı.' : `Geçmek için en az %${result.passPct} gerekli; tekrar deneyebilirsiniz.`}</p>}
    <button className="btn primary" disabled={busy || Object.keys(answers).length < count}>{busy ? 'Değerlendiriliyor…' : done ? 'Testi tekrar çöz' : 'Cevapları gönder'}</button></form>;
}
export default function CourseDetail() {
  const { id } = useParams<{ id: string }>(); const { data: c, error, isLoading } = useData<Course>(`/courses/${id}`);
  const { data: articles } = useData<KnowledgePage>('/knowledge?pageSize=100', !!c?.canManage);
  if (isLoading) return <Loading />; if (!c) return <><Link className="text-link" href="/academy">← Akademi</Link><Notice error={error ?? 'Eğitim bulunamadı.'} /></>;
  const completed = c.lessons.filter(l => l.progress?.completedAt).length; const draft = c.status === 'DRAFT';
  const status = (s: string) => api(`/courses/${id}`, 'PATCH', { version: c.version, status: s });
  return <><Link className="text-link" href="/academy">← Akademi</Link><Title title={c.title} subtitle={`${completed} / ${c.lessons.length} ders tamamlandı${c.product ? ` · ${c.product.name}` : ''}`} />
    {c.description && <p className="prewrap mb-6">{c.description}</p>}
    {c.canManage && <Panel title="Eğitim yönetimi"><p><Badge>{courseStatusLabels[c.status]}</Badge></p><div className="quote-actions">{draft && <Action confirm="Eğitim yayınlanacak; yayındayken dersler düzenlenemez. Devam edilsin mi?" run={() => status('PUBLISHED')}>Yayınla</Action>}{c.status === 'PUBLISHED' && <Action run={() => status('DRAFT')}>Düzenlemek için taslağa al</Action>}{c.status !== 'ARCHIVED' && <Action confirm="Eğitim arşivlenecek ve öğrenenlerden gizlenecek. Devam edilsin mi?" run={() => status('ARCHIVED')}>Arşivle</Action>}{c.status === 'ARCHIVED' && <Action run={() => status('DRAFT')}>Arşivden çıkar</Action>}</div>{!draft && <p className="muted">Ders eklemek veya düzenlemek için eğitimi taslağa alın. Kazanılan ilerleme korunur.</p>}</Panel>}
    {c.lessons.length === 0 && <Empty>{c.canManage ? 'Henüz ders yok. Aşağıdan ilk dersi ekleyin.' : 'Bu eğitimde henüz ders yok.'}</Empty>}
    {c.lessons.map((l, i) => <section className="panel" key={l.id}><h2>{i + 1}. {l.title} {l.progress?.completedAt && <Badge>✓ Tamamlandı</Badge>}</h2><p className="prewrap">{l.body}</p>{l.article && <p className="mt-3"><Link className="text-link" href={`/knowledge/${l.article.id}`}>İlgili bilgi kartı: {l.article.title}</Link></p>}
      {l.progress && <p className="muted mt-3">{l.progress.attempts} deneme · en iyi puan %{l.progress.bestScore ?? 0}</p>}
      {c.status === 'PUBLISHED' && <div className="mt-4"><Quiz lesson={l} /></div>}
      {c.canManage && draft && <Editor title="Dersi düzenle"><LessonForm lesson={l} articles={articles?.items ?? []} onSave={b => api(`/lessons/${l.id}`, 'PATCH', b)} /></Editor>}</section>)}
    {c.canManage && draft && <Editor title="Ders ekle" open={c.lessons.length === 0}><LessonForm articles={articles?.items ?? []} label="Dersi ekle" onSave={b => api(`/courses/${id}/lessons`, 'POST', b)} /></Editor>}</>;
}
