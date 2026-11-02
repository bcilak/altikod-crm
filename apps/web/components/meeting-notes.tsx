'use client';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { meetingNoteMaxLength, noteItems } from '@saleshub/shared';
import { api, type Meeting } from '../lib/api';
import MeetingNoteInput from './meeting-note-input';
import { Notice } from './ui';
import { useWorkingDraft } from './working-drafts';

type Field = 'notes' | 'outcome';
type Texts = { notes: string; outcome: string };
const fields: Record<Field, { tab: string; title: string; placeholder: string }> = {
  notes: { tab: 'Konu', title: 'Görüşülen konular', placeholder: 'Görüşülen konu, ihtiyaç veya ayrıntı…' },
  outcome: { tab: 'Karar / yapılacak', title: 'Kararlar ve yapılacaklar', placeholder: 'Kim, neyi, ne zamana kadar yapacak?' },
};
const updatedAt = (m: Meeting) => m.notesUpdatedAt ? Date.parse(m.notesUpdatedAt) : 0;

/**
 * Meeting-time note taking works like a chat composer: type one item, send, the field clears and stays focused. Each send is
 * appended on the server (no overwrite between people). Correcting earlier items is a separate, explicit edit mode.
 */
export default function MeetingNotes({ meeting, label = 'Not al' }: { meeting: Meeting; label?: string }) {
  const cache = useQueryClient(); const input = useRef<HTMLTextAreaElement>(null);
  const [latest, setLatest] = useState<Meeting>();
  const server = latest && updatedAt(latest) >= updatedAt(meeting) ? latest : meeting;
  const [field, setField] = useWorkingDraft<Field>(`meeting-field:${meeting.id}`, 'notes');
  const [text, setText] = useWorkingDraft(`meeting-note:${meeting.id}:${field}`, '');
  const [edit, setEdit] = useWorkingDraft<Texts | null>(`meeting-edit:${meeting.id}`, null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(); const [status, setStatus] = useState('');
  const editDirty = !!edit && (edit.notes !== (server.notes ?? '') || edit.outcome !== (server.outcome ?? ''));
  const unsent = !!text.trim() || editDirty;
  useEffect(() => {
    if (!unsent) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [unsent]);
  const run = async (task: () => Promise<Meeting>, done: string) => {
    setBusy(true); setError(undefined); setStatus('');
    try { setLatest(await task()); setStatus(done); await cache.invalidateQueries(); return true; }
    catch (e) { setError(e); return false; } finally { setBusy(false); }
  };
  const send = async () => {
    if (busy || !text.trim()) return;
    if (await run(() => api<Meeting>(`/meetings/${meeting.id}/notes`, 'POST', { field, text }), `${fields[field].tab} eklendi.`)) setText('');
    requestAnimationFrame(() => input.current?.focus());
  };
  const items = noteItems(server[field]);

  return <details className="quick-notes"><summary>{label}</summary><div className="quick-notes-body">
    {!edit ? <>
      <div className="note-tabs" role="group" aria-label="Eklenecek madde türü">{(Object.keys(fields) as Field[]).map(f =>
        <button key={f} type="button" className={`btn${field === f ? ' primary' : ''}`} aria-pressed={field === f} onClick={() => { setField(f); setStatus(''); }}>{fields[f].tab} <span className="note-count">{noteItems(server[f]).length}</span></button>)}</div>
      <section aria-label={fields[field].title}>{items.length ? <ol className="meeting-note-list compact">{items.map((item, i) => <li key={i}><span className="note-number" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>
        : <p className="muted">Henüz madde yok. İlk maddeyi aşağıya yazın.</p>}</section>
      <form className="note-composer" onSubmit={e => { e.preventDefault(); void send(); }}>
        <textarea ref={input} aria-label={`Yeni madde: ${fields[field].title}`} value={text} rows={2} maxLength={1000} placeholder={fields[field].placeholder} enterKeyHint="send" spellCheck disabled={busy}
          onChange={e => { setText(e.target.value); setStatus(''); }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
        <button className="btn primary" disabled={busy || !text.trim()}>{busy ? 'Ekleniyor…' : 'Ekle'}</button>
      </form>
      <div className="notes-save"><span role="status">{status || 'Enter ile ekleyin. Her gönderim hemen kaydedilir.'}</span>
        <button type="button" className="link-button" disabled={busy} onClick={() => { setEdit({ notes: server.notes ?? '', outcome: server.outcome ?? '' }); setStatus(''); setError(undefined); }}>Önceki maddeleri düzenle</button></div>
    </> : <form onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      if (await run(() => api<Meeting>(`/meetings/${meeting.id}`, 'PATCH', { notes: edit.notes || null, outcome: edit.outcome || null }), 'Düzeltmeler kaydedildi.')) setEdit(null);
    }}>
      <p className="muted">Maddeleri düzeltin veya silin. Her satır bir maddedir.</p>
      <MeetingNoteInput label="Toplantı notları" value={edit.notes} onChange={notes => setEdit({ ...edit, notes })} disabled={busy} maxLength={meetingNoteMaxLength} placeholder={'- Görüşülen konu veya ihtiyaç'} />
      <MeetingNoteInput label="Kararlar ve sonraki adım" value={edit.outcome} onChange={outcome => setEdit({ ...edit, outcome })} disabled={busy} maxLength={meetingNoteMaxLength} placeholder={'- Sorumlu kişi · Yapılacak iş · Hedef tarih'} />
      <div className="notes-save"><button className="btn primary" disabled={busy || !editDirty}>{busy ? 'Kaydediliyor…' : 'Düzeltmeleri kaydet'}</button><button type="button" className="btn" disabled={busy} onClick={() => { if (!editDirty || window.confirm('Kaydedilmemiş düzeltmeler silinsin mi?')) setEdit(null); }}>Vazgeç</button></div>
    </form>}
    <Notice error={error} />
  </div></details>;
}
