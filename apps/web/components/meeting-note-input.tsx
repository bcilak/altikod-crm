'use client';
import { useRef } from 'react';
import { noteItems } from '@saleshub/shared';

export default function MeetingNoteInput({ label, value, onChange, disabled, placeholder, maxLength }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; placeholder: string; maxLength: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const add = () => {
    const next = value ? `${value}${value.endsWith('\n') ? '' : '\n'}- ` : '- ';
    if (next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(next.length, next.length); });
  };
  return <div className="meeting-note-input"><div className="note-input-heading"><strong>{label}</strong><span className="muted">{noteItems(value).length} madde</span></div>
    <div className="note-input-toolbar"><button className="btn" type="button" disabled={disabled || value.length > maxLength - 3} onClick={add}>+ Madde ekle</button><small>Her satır bir madde · Enter ile devam et</small></div>
    <textarea ref={ref} aria-label={label} value={value} onChange={e => onChange(e.target.value)} rows={6} maxLength={maxLength} placeholder={placeholder} spellCheck disabled={disabled} onKeyDown={e => {
      if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
      const field = e.currentTarget; const start = field.selectionStart; const end = field.selectionEnd;
      const insertion = '\n- '; const next = value.slice(0, start) + insertion + value.slice(end);
      e.preventDefault(); if (next.length > maxLength) return;
      onChange(next); requestAnimationFrame(() => { field.setSelectionRange(start + insertion.length, start + insertion.length); });
    }} /><small className="muted">{value.length}/{maxLength} karakter · Kaydetmeden çıkmayın.</small>
  </div>;
}
