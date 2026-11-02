import { formatDate, type Meeting } from '../lib/api';
export default function MeetingNoteMeta({ meeting }: { meeting: Meeting }) {
  const hasRecord = meeting.notes || meeting.outcome || meeting.notesUpdatedAt;
  if (!hasRecord) return <p className="muted">Henüz toplantı notu kaydedilmedi.</p>;
  return <div className="meeting-note-meta">
    <p><strong>İlk kaydeden:</strong> {meeting.notesCreatedByName ?? 'Bilinmiyor (eski kayıt)'}<br /><strong>İlk kayıt:</strong> {meeting.notesCreatedAt ? formatDate(meeting.notesCreatedAt) : 'Tarih bilgisi yok'}</p>
    {meeting.notesUpdatedAt && <p><strong>Son kaydeden:</strong> {meeting.notesUpdatedByName}<br /><strong>Son kayıt:</strong> {formatDate(meeting.notesUpdatedAt)}</p>}
    <small className="muted">Kayıt saatleri Türkiye saatiyle gösterilir.</small>
  </div>;
}
