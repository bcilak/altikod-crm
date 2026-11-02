'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDate, type Meeting } from '../../../../lib/api';
import { Loading, Notice, Title, useData } from '../../../../components/ui';
import MeetingNoteMeta from '../../../../components/meeting-note-meta';
import MeetingNoteList from '../../../../components/meeting-note-list';
import MeetingNotes from '../../../../components/meeting-notes';
export default function MeetingReader() {
  const { id } = useParams<{ id: string }>();
  const { data: meeting, error, isLoading } = useData<Meeting>(`/meetings/${id}`);
  if (isLoading) return <Loading />;
  if (!meeting) return <Notice error={error ?? 'Toplantı bulunamadı'} />;
  return <><Link className="text-link" href="/calendar">← Takvime dön</Link><Title title={meeting.title} subtitle={meeting.company.displayName} />
    <article className="panel meeting-reader"><h2>Toplantı bilgileri</h2><p>{formatDate(meeting.startsAt)} — {formatDate(meeting.endsAt)}</p><p>{meeting.location || 'Konum belirtilmedi'}</p>
      {meeting.agenda && <><h2>Gündem</h2><p className="prewrap">{meeting.agenda}</p></>}
      <MeetingNoteList title="Görüşülen konular" text={meeting.notes} empty="Henüz konu eklenmedi." />
      <MeetingNoteList title="Kararlar ve yapılacaklar" text={meeting.outcome} empty="Henüz karar veya yapılacak iş eklenmedi." decisions />
      <details className="note-record-details"><summary>Not kayıt bilgileri</summary><MeetingNoteMeta meeting={meeting} /></details>
    </article>
    {meeting.canWrite && <section className="panel"><MeetingNotes meeting={meeting} label="Madde ekle veya düzelt" /></section>}
  </>;
}
