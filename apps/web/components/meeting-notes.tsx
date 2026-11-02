'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Meeting } from '../lib/api';
import { Notice } from './ui';
import { useWorkingDraft } from './working-drafts';

export default function MeetingNotes({ meeting, label = 'Not al' }: { meeting: Meeting; label?: string }) {
  const [notes, setNotes] = useWorkingDraft(`meeting-notes:${meeting.id}`, meeting.notes ?? ''); const [outcome, setOutcome] = useWorkingDraft(`meeting-outcome:${meeting.id}`, meeting.outcome ?? '');
  const [saved, setSaved] = useState({ notes: meeting.notes ?? '', outcome: meeting.outcome ?? '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(); const [done, setDone] = useState(false); const cache = useQueryClient();
  const dirty = notes !== saved.notes || outcome !== saved.outcome;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return <details className="quick-notes"><summary>{label}</summary><form onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError(undefined); setDone(false);
    try { await api(`/meetings/${meeting.id}`, 'PATCH', { notes: notes || null, outcome: outcome || null }); setSaved({ notes, outcome }); setDone(true); await cache.invalidateQueries({ queryKey: [] }); }
    catch (error) { setError(error); } finally { setBusy(false); }
  }}><label>Toplantı notları<textarea aria-label="Toplantı notları" value={notes} onChange={e => { setNotes(e.target.value); setDone(false); }} rows={6} maxLength={5000} placeholder="Görüşülen konular, ihtiyaçlar, önemli ayrıntılar…" spellCheck disabled={busy} /></label><label>Kararlar ve sonraki adım<textarea aria-label="Kararlar ve sonraki adım" value={outcome} onChange={e => { setOutcome(e.target.value); setDone(false); }} rows={3} maxLength={5000} placeholder="Kim, neyi, ne zamana kadar yapacak?" disabled={busy} /></label><div className="notes-save"><button className="btn primary" disabled={busy || !dirty}>{busy ? 'Kaydediliyor…' : 'Notları kaydet'}</button><span role="status">{done ? 'Notlar kaydedildi.' : dirty ? 'Kaydedilmemiş değişiklikler' : 'Notlar güncel'}</span></div><Notice error={error} /></form></details>;
}
