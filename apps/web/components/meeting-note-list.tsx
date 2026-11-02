import { noteItems } from '@saleshub/shared';

export default function MeetingNoteList({ text, title, empty, decisions = false }: { text?: string | null; title: string; empty: string; decisions?: boolean }) {
  const items = noteItems(text);
  return <section className={`meeting-note-section${decisions ? ' decisions' : ''}`} aria-label={title}>
    <div className="note-section-heading"><h2>{title}</h2><span className="badge">{items.length} madde</span></div>
    {items.length ? <ol className="meeting-note-list">{items.map((item, index) => <li key={index}><span className="note-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol> : <p className="muted">{empty}</p>}
  </section>;
}
