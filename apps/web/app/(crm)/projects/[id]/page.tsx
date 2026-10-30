'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, formatDate, money, taskLabels } from '../../../../lib/api';
import { projectStatusLabels, projectTransitions, type Project } from '../../../../lib/delivery';
import { Action, Badge, Editor, Empty, FieldsForm, Loading, Notice, Panel, Title, options, useData } from '../../../../components/ui';
import { personChoice } from '../../../../components/crm-fields';
const nextLabel: Record<string, string> = { IN_PROGRESS: 'Başlat / sürdür', ON_HOLD: 'Beklemeye al', COMPLETED: 'Tamamlandı olarak işaretle', CANCELLED: 'İptal et' };
export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>(); const { data: p, error, isLoading } = useData<Project>(`/projects/${id}`);
  if (isLoading) return <Loading />; if (!p) return <><Link className="text-link" href="/projects">← Projeler</Link><Notice error={error ?? 'Proje bulunamadı.'} /></>;
  const open = !['COMPLETED', 'CANCELLED'].includes(p.status);
  const move = (status: string) => api(`/projects/${id}`, 'PATCH', { version: p.version, status });
  return <><Link className="text-link" href="/projects">← Projeler</Link><Title title={p.title} subtitle={`${p.company.displayName} · ${projectStatusLabels[p.status]}`} />
    <div className="detail-grid"><div>
      <Panel title="Teslimat özeti"><p className="prewrap">{p.summary}</p><dl className="facts"><dt>Durum</dt><dd><Badge>{projectStatusLabels[p.status]}</Badge></dd><dt>Sorumlu</dt><dd>{p.owner.name}</dd><dt>Başlangıç</dt><dd>{formatDate(p.startAt ?? undefined)}</dd><dt>Hedef teslim</dt><dd>{formatDate(p.dueAt)}</dd>{p.completedAt && <><dt>Tamamlandı</dt><dd>{formatDate(p.completedAt)}</dd></>}</dl>
        {p.canWrite && <div className="quote-actions">{projectTransitions[p.status].map(s => <Action key={s} run={() => move(s)} confirm={s === 'CANCELLED' ? 'Proje iptal edilecek. İptal edilen proje yeniden açılamaz. Devam edilsin mi?' : undefined}>{p.status === 'COMPLETED' && s === 'IN_PROGRESS' ? 'Yeniden aç' : nextLabel[s]}</Action>)}</div>}
        {p.status === 'IN_PROGRESS' && p.canWrite && <p className="muted mt-3">Tamamlamak için tüm kilometre taşları ve proje görevleri kapatılmış olmalı.</p>}</Panel>
      {p.commercial && <Panel title="Satış bilgisi"><p><Link className="text-link" href={`/opportunities/${p.commercial.opportunity.id}`}>{p.commercial.opportunity.title}</Link></p>{p.commercial.quote ? <p className="notice">Kabul edilen teklif: {p.commercial.quote.number} V{p.commercial.quote.version} · {money(p.commercial.quote.total, p.commercial.quote.currency)}</p> : <p>Manuel kazanım gerekçesi: {p.commercial.manualWinReason ?? '—'}</p>}{p.commercial.contractUrl && <a className="btn" href={p.commercial.contractUrl} target="_blank" rel="noopener noreferrer">Sözleşme bağlantısı</a>}</Panel>}
      <Panel title="Kilometre taşları">{p.milestones.length === 0 && <Empty>Henüz kilometre taşı yok.{p.canWrite && open ? ' Aşağıdan ilkini ekleyin.' : ''}</Empty>}
        {p.milestones.map(m => <div className="record" key={m.id}><div><strong>{m.completedAt ? '✓ ' : ''}{m.title}</strong><small className="muted block">Hedef {formatDate(m.dueAt)}{m.completedAt ? ` · Tamamlandı ${formatDate(m.completedAt)}` : ''}</small></div>{p.canWrite && open && <Action run={() => api(`/project-milestones/${m.id}`, 'PATCH', { completed: !m.completedAt })}>{m.completedAt ? 'Geri al' : 'Tamamlandı'}</Action>}</div>)}
        {p.canWrite && open && <Editor title="Kilometre taşı ekle"><FieldsForm fields={[{ name: 'title', label: 'Kilometre taşı', required: true }, { name: 'dueAt', label: 'Hedef tarih (İstanbul)', type: 'datetime-local', required: true }]} onSave={b => api(`/projects/${id}/milestones`, 'POST', b)} /></Editor>}</Panel>
    </div><div>
      <Panel title="Proje görevleri">{p.tasks.length === 0 && <Empty>Henüz görev yok.</Empty>}
        {p.tasks.map(t => <div className="record" key={t.id}><div><Link className="text-link" href={`/tasks?task=${t.id}`}>{t.title}</Link><small className="muted block">{t.assignee.name} · {formatDate(t.dueAt)}</small></div><Badge>{taskLabels[t.status] ?? t.status}</Badge></div>)}
        {p.canWrite && open && <Editor title="Görev ekle"><FieldsForm fields={[personChoice(p.assignees), { name: 'title', label: 'Görev', required: true }, { name: 'description', label: 'Açıklama', type: 'textarea', nullable: true }, { name: 'dueAt', label: 'Hedef tarih (İstanbul)', type: 'datetime-local', required: true }, { name: 'priority', label: 'Öncelik', type: 'select', options: options({ LOW: 'Düşük', NORMAL: 'Normal', HIGH: 'Yüksek', URGENT: 'Acil' }) }]} initial={{}} onSave={b => api(`/projects/${id}/tasks`, 'POST', b)} /></Editor>}</Panel>
      {p.canManage && p.status !== 'CANCELLED' && <Editor title="Projeyi düzenle"><FieldsForm key={p.version} fields={[{ name: 'title', label: 'Proje adı', required: true }, personChoice(p.assignees, 'ownerId'), { name: 'dueAt', label: 'Hedef teslim (İstanbul)', type: 'datetime-local', required: true }]} initial={{ title: p.title, ownerId: p.owner.id, dueAt: p.dueAt }} onSave={b => api(`/projects/${id}`, 'PATCH', { ...b, version: p.version })} /></Editor>}
    </div></div></>;
}
