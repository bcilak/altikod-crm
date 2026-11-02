'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDate, type Meeting } from '../../../../lib/api';
import { Loading, Notice, Title, useData } from '../../../../components/ui';
import MeetingNoteMeta from '../../../../components/meeting-note-meta';
import MeetingNotes from '../../../../components/meeting-notes';
export default function MeetingReader() {
  const { id } = useParams<{ id: string }>();
  const { data: meeting, error, isLoading } = useData<Meeting>(`/meetings/${id}`);
  if (isLoading) return <Loading />;
  if (!meeting) return <Notice error={error ?? 'Toplantı bulunamadı'} />;
  return <><Link className="text-link" href="/calendar">← Takvime dön</Link><Title title={meeting.title} subtitle={meeting.company.displayName} />
    <article className="panel meeting-reader"><h2>Toplantı bilgileri</h2><p>{formatDate(meeting.startsAt)} — {formatDate(meeting.endsAt)}</p><p>{meeting.location || 'Konum belirtilmedi'}</p>
      {meeting.agenda && <><h2>Gündem</h2><p className="prewrap">{meeting.agenda}</p></>}
      <h2>Not kayıt bilgileri</h2><MeetingNoteMeta meeting={meeting} />
      <h2>Toplantı notları</h2><p className="prewrap">{meeting.notes || 'Not eklenmedi.'}</p>
      <h2>Kararlar ve sonraki adım</h2><p className="prewrap">{meeting.outcome || 'Karar eklenmedi.'}</p>
    </article>
    {meeting.canWrite && <section className="panel"><MeetingNotes meeting={meeting} label="Notları düzenle" /></section>}
  </>;
}
