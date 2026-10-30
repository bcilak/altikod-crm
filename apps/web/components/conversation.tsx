'use client';
import { Fragment, useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatDate, upload } from '../lib/api';
import { fileSize } from '../lib/delivery';
import { attachmentScanLabels, attachmentUrl, conversationsKey, downloadable, filesKey, messageAttachmentAccept, messageAttachmentMaxBytes, messageAttachmentsPerMessage, messageEditWindowMs, messageMaxLength, messageStateLabels, newNonce, pinsKey, roleLabels, type Attachment, type Colleague, type Mention, type Message, type MessagePage, type SharedFile } from '../lib/messaging';
import { Notice } from './ui';
import { useLiveIntervals } from './live';

const messagesKey = (conversationId: string, parentId?: string) => ['messaging-messages', conversationId, parentId ?? null];

/** Plain text only: http(s) addresses become links that open in a new tab without referrer; nothing else is interpreted. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Plain text only: http(s) addresses become links that open in a new tab without referrer, and the server-confirmed
 * mentions are highlighted (mine more strongly). Nothing else is interpreted.
 */
function MessageText({ body, mentions = [], meId }: { body: string; mentions?: Mention[]; meId?: string }) {
  const names = mentions.map(m => `@${m.name}`).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(https?:\\/\\/[^\\s<>"']+${names.length ? `|${names.map(escapeRegex).join('|')}` : ''})`, 'g');
  return <p className="message-body">{body.split(pattern).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    const mention = mentions.find(m => `@${m.name}` === part);
    if (mention) return <span key={i} className={`mention${mention.id === meId ? ' me' : ''}`}>{part}</span>;
    const url = part.replace(/[.,;:!?)]+$/, ''); const rest = part.slice(url.length);
    return <Fragment key={i}><a className="text-link" href={url} target="_blank" rel="noopener noreferrer">{url}</a>{rest}</Fragment>;
  })}</p>;
}

/** Index of the “@” that starts the mention being typed just before the caret. */
const mentionStart = (value: string, caret: number) => value.lastIndexOf('@', caret - 1);
const extension = (name: string) => /\.([a-z0-9]{1,5})$/i.exec(name)?.[1]?.toUpperCase() ?? 'DOSYA';
/** A sent file: images that passed scanning show as a thumbnail; everything else is a download link. Blocked files explain why. */
export function AttachmentView({ file }: { file: Attachment }) {
  if (!downloadable(file)) return <span className="file-chip blocked"><span className="file-ext">{extension(file.name)}</span><span><strong>{file.name}</strong><small className="block">{attachmentScanLabels[file.scanStatus]}</small></span></span>;
  return <a className="file-chip" href={attachmentUrl(file.id)} download={file.name}>
    {file.mimeType.startsWith('image/') ? <img className="file-thumb" src={attachmentUrl(file.id, true)} alt="" loading="lazy" /> : <span className="file-ext">{extension(file.name)}</span>}
    <span><strong>{file.name}</strong><small className="block">{fileSize(file.size)}{file.scanStatus === 'UNSCANNED' ? ` · ${attachmentScanLabels.UNSCANNED}` : ''}</small></span></a>;
}

export function Composer({ conversationId, parentId, onSent, label = 'Mesaj yaz' }: { conversationId: string; parentId?: string; onSent?: () => void; label?: string }) {
  const [body, setBody] = useState(''); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Attachment[]>([]); const [uploading, setUploading] = useState(0); const [sendFailed, setSendFailed] = useState(false);
  const nonce = useRef(newNonce()); const picker = useRef<HTMLInputElement>(null); const box = useRef<HTMLTextAreaElement>(null); const cache = useQueryClient();
  // @-mentions: the typed “@name” stays plain text; the chosen people travel as ids and the server checks they can read the conversation.
  const [mentions, setMentions] = useState<Mention[]>([]); const [query, setQuery] = useState<string | null>(null); const [active, setActive] = useState(0);
  const suggestions = useQuery({ queryKey: ['/messaging/users', query], queryFn: () => api<Colleague[]>(`/messaging/users?search=${encodeURIComponent(query?.trim() ?? '')}`), enabled: query !== null, staleTime: 60_000 });
  const options = query === null ? [] : (suggestions.data ?? []).slice(0, 6);
  const listId = `mentions-${conversationId}-${parentId ?? 'root'}`;
  // Names contain spaces, so the query runs from “@” to the caret (one line, 30 characters); text after a chosen name does not reopen it.
  const track = (value: string, caret: number) => {
    const match = /(^|\s)@([^\n@]{0,30})$/.exec(value.slice(0, caret)); const q = match?.[2];
    setQuery(q === undefined || mentions.some(m => q.startsWith(m.name)) ? null : q); setActive(0);
  };
  const choose = (person: Colleague) => {
    const el = box.current; if (!el) return;
    const caret = el.selectionStart; const start = mentionStart(body, caret);
    const next = `${body.slice(0, start)}@${person.name} ${body.slice(caret)}`;
    setBody(next); setQuery(null); setMentions(prev => prev.some(m => m.id === person.id) ? prev : [...prev, { id: person.id, name: person.name }]);
    requestAnimationFrame(() => { const at = start + person.name.length + 2; el.focus(); el.setSelectionRange(at, at); });
  };
  /** Files go up immediately as private drafts (scanned on arrival); sending links them to the message. */
  const attach = async (list: FileList | File[]) => {
    const chosen = [...list].slice(0, messageAttachmentsPerMessage - files.length - uploading);
    if (list.length > chosen.length) setError(`Bir mesaja en fazla ${messageAttachmentsPerMessage} dosya eklenebilir`); else setError(undefined);
    for (const file of chosen) {
      if (file.size > messageAttachmentMaxBytes) { setError(`${file.name}: dosya en fazla 20 MB olabilir`); continue; }
      setUploading(n => n + 1);
      try { const row = await upload<Attachment>(`/messaging/conversations/${conversationId}/attachments`, file, 'Dosya en fazla 20 MB olabilir'); setFiles(prev => [...prev, row]); nonce.current = newNonce(); }
      catch (e) { setError(e instanceof Error ? new Error(`${file.name}: ${e.message}`) : e); } finally { setUploading(n => n - 1); }
    }
  };
  const detach = async (file: Attachment) => { setFiles(prev => prev.filter(f => f.id !== file.id)); nonce.current = newNonce(); await api(`/messaging/attachments/${file.id}/remove`, 'POST').catch(() => undefined); };
  const send = async () => {
    if ((!body.trim() && !files.length) || busy || uploading) return;
    setBusy(true); setError(undefined); setSendFailed(false);
    try {
      await api(`/messaging/conversations/${conversationId}/messages`, 'POST', { body, clientNonce: nonce.current, attachmentIds: files.map(f => f.id), mentionIds: mentions.filter(m => body.includes(`@${m.name}`)).map(m => m.id), ...(parentId ? { parentId } : {}) });
      setBody(''); setFiles([]); setMentions([]); nonce.current = newNonce();
      await Promise.all([cache.invalidateQueries({ queryKey: ['messaging-messages', conversationId] }), cache.invalidateQueries({ queryKey: conversationsKey }), cache.invalidateQueries({ queryKey: filesKey(conversationId) })]);
      onSent?.();
    } catch (e) { setError(e); setSendFailed(true); } finally { setBusy(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length); return; }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) { e.preventDefault(); choose(options[active] ?? options[0]!); return; }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
  };
  const onPaste = (e: ClipboardEvent) => { if (e.clipboardData.files.length) { e.preventDefault(); void attach(e.clipboardData.files); } };
  const onDrop = (e: DragEvent) => { if (e.dataTransfer.files.length) { e.preventDefault(); void attach(e.dataTransfer.files); } };
  const full = files.length + uploading >= messageAttachmentsPerMessage;
  return <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
    <label><span className="sr-only">{label}</span><textarea ref={box} aria-label={label} placeholder={`${label} · Enter gönderir, Shift+Enter yeni satır, @ ile kişi anın`} rows={2} maxLength={messageMaxLength} value={body}
      role="combobox" aria-autocomplete="list" aria-expanded={options.length > 0} aria-controls={listId} aria-activedescendant={options.length ? `${listId}-${active}` : undefined}
      onChange={e => { setBody(e.target.value); track(e.target.value, e.target.selectionStart); if (sendFailed) nonce.current = newNonce(); }} onKeyDown={onKey} onPaste={onPaste} onBlur={() => setTimeout(() => setQuery(null), 150)} /></label>
    {options.length > 0 && <ul id={listId} role="listbox" className="mention-options" aria-label="Bahsedilecek kişi">{options.map((p, i) => <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); choose(p); }}>{p.name} <small className="muted">· {roleLabels[p.role] ?? p.role}</small></li>)}</ul>}
    {(files.length > 0 || uploading > 0) && <ul className="draft-files" aria-label="Eklenecek dosyalar">{files.map(f => <li key={f.id} className="file-chip"><span className="file-ext">{extension(f.name)}</span><span><strong>{f.name}</strong><small className="block">{fileSize(f.size)}{f.scanStatus !== 'CLEAN' ? ` · ${attachmentScanLabels[f.scanStatus]}` : ''}</small></span><button type="button" className="link-button" aria-label={`${f.name} dosyasını kaldır`} onClick={() => void detach(f)}>Kaldır</button></li>)}
      {uploading > 0 && <li className="file-chip" role="status">Yükleniyor ve taranıyor…</li>}</ul>}
    <div className="composer-actions">
      <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" multiple accept={messageAttachmentAccept} onChange={e => { if (e.target.files) void attach(e.target.files); e.target.value = ''; }} />
      <button type="button" className="btn" disabled={full} onClick={() => picker.current?.click()}>Dosya ekle</button>
      <small className="muted composer-hint">PDF, görsel, Word, Excel, PowerPoint, CSV, TXT · en fazla 20 MB · sürükleyip bırakabilirsiniz</small>
      {body.length > messageMaxLength - 500 && <small className="muted">{body.length}/{messageMaxLength}</small>}<button className="btn primary" disabled={busy || uploading > 0 || (!body.trim() && !files.length)}>{busy ? 'Gönderiliyor…' : 'Gönder'}</button></div>
    <Notice error={error} />{sendFailed && <small className="muted">Taslak korundu; tekrar gönderdiğinizde mesaj iki kez kaydedilmez.</small>}
  </form>;
}

export type Abilities = { canModerate: boolean; canSuggestKnowledge: boolean };
type Revision = { body: string; at: string; current: boolean };
/** Per-message actions. Buttons only reflect what the server allows; every action is checked again there. */
function MessageActions({ message, meId, canPost, abilities, onChange }: { message: Message; meId: string; canPost: boolean; abilities: Abilities; onChange: (m: Message) => void }) {
  const [mode, setMode] = useState<null | 'edit' | 'hide' | 'knowledge'>(null); const [text, setText] = useState(''); const [category, setCategory] = useState('');
  const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false); const [done, setDone] = useState<string>();
  const own = message.author.id === meId; const active = message.state === 'ACTIVE';
  const editable = own && active && canPost && Date.now() - new Date(message.createdAt).getTime() < messageEditWindowMs;
  const run = async (task: () => Promise<Message | void>, close = true) => {
    setBusy(true); setError(undefined);
    try { const result = await task(); if (result) onChange(result); if (close) setMode(null); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const actions: [string, () => void][] = [
    ...(editable ? [['Düzenle', () => { setText(message.body); setMode('edit'); }] as [string, () => void]] : []),
    ...(own && message.state !== 'DELETED' && message.state !== 'EXPIRED' ? [['Sil', () => { if (window.confirm('Mesaj silinsin mi? Konuşmada “Bu mesaj silindi” olarak görünür.')) void run(() => api<Message>(`/messaging/messages/${message.id}/delete`, 'POST')); }] as [string, () => void]] : []),
    ...(active && canPost ? [[message.pinnedAt ? 'Sabitlemeyi kaldır' : 'Sabitle', () => void run(() => api<Message>(`/messaging/messages/${message.id}/${message.pinnedAt ? 'unpin' : 'pin'}`, 'POST'))] as [string, () => void]] : []),
    ...(active && abilities.canModerate ? [['Gizle', () => { setText(''); setMode('hide'); }] as [string, () => void]] : []),
    ...(message.state === 'HIDDEN' && abilities.canModerate ? [['Gizlemeyi kaldır', () => void run(() => api<Message>(`/messaging/messages/${message.id}/unhide`, 'POST'))] as [string, () => void]] : []),
    ...(active && abilities.canSuggestKnowledge ? [['Bilgi bankasına öner', () => { setText(''); setCategory(''); setDone(undefined); setMode('knowledge'); }] as [string, () => void]] : []),
  ];
  if (!actions.length && !mode && !done) return null;
  return <div className="message-actions">
    {!mode && <details className="action-menu"><summary aria-label="Mesaj işlemleri">İşlemler</summary><div role="group" aria-label="Mesaj işlemleri">{actions.map(([label, act]) => <button key={label} type="button" className="link-button" disabled={busy} onClick={e => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; act(); }}>{label}</button>)}</div></details>}
    {mode === 'edit' && <form className="inline-form" onSubmit={e => { e.preventDefault(); void run(() => api<Message>(`/messaging/messages/${message.id}`, 'PATCH', { body: text })); }}>
      <label>Mesajı düzenle<textarea value={text} maxLength={messageMaxLength} rows={2} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } if (e.key === 'Escape') setMode(null); }} autoFocus /></label>
      <small className="muted">Önceki metin düzenleme geçmişinde kalır. Bahsetmeler değişmez.</small>
      <div className="quote-actions"><button className="btn primary" disabled={busy}>Kaydet</button><button type="button" className="btn" onClick={() => setMode(null)}>Vazgeç</button></div></form>}
    {mode === 'hide' && <form className="inline-form" onSubmit={e => { e.preventDefault(); void run(() => api<Message>(`/messaging/messages/${message.id}/hide`, 'POST', { reason: text })); }}>
      <label>Gizleme gerekçesi (herkese gösterilir, denetim kaydına yazılır)<input value={text} minLength={3} maxLength={500} required onChange={e => setText(e.target.value)} autoFocus /></label>
      <div className="quote-actions"><button className="btn primary" disabled={busy}>Gizle</button><button type="button" className="btn" onClick={() => setMode(null)}>Vazgeç</button></div></form>}
    {done && !mode && <p role="status" className="success">{done} <button type="button" className="link-button" onClick={() => setDone(undefined)}>Kapat</button></p>}
    {mode === 'knowledge' && <form className="inline-form" onSubmit={e => { e.preventDefault(); void run(async () => {
      const r = await api<{ articleId: string; attached: string[]; skipped: string[] }>(`/messaging/messages/${message.id}/knowledge`, 'POST', { title: text, category });
      setDone(`Taslak bilgi kartı oluşturuldu${r.attached.length ? `, ${r.attached.length} dosya eklendi` : ''}${r.skipped.length ? `; eklenemeyen: ${r.skipped.join(', ')} (bilgi bankası yalnız taranmış PDF/PNG/JPEG, en fazla 5 MB kabul eder)` : ''}. İnceleme ve yayın bilgi bankasında yapılır.`);
    }); }}>
      <label>Kart başlığı<input value={text} maxLength={200} required onChange={e => setText(e.target.value)} autoFocus /></label>
      <label>Kategori<input value={category} maxLength={100} required onChange={e => setCategory(e.target.value)} /></label>
      <div className="quote-actions"><button className="btn primary" disabled={busy}>Taslak oluştur</button><button type="button" className="btn" onClick={() => setMode(null)}>Vazgeç</button></div></form>}
    <Notice error={error} />
  </div>;
}

function History({ id }: { id: string }) {
  const history = useQuery({ queryKey: ['messaging-revisions', id], queryFn: () => api<Revision[]>(`/messaging/messages/${id}/revisions`) });
  if (history.error) return <Notice error={history.error} />;
  return <ol className="revisions" aria-label="Düzenleme geçmişi">{history.data?.map((r, i) => <li key={i}><small className="muted">{formatDate(r.at)}{r.current ? ' · güncel' : ''}</small><p className="message-body">{r.body || '—'}</p></li>)}</ol>;
}

function MessageItem({ message, meId, conversationId, canPost, threaded, abilities, onChange }: { message: Message; meId: string; conversationId: string; canPost: boolean; threaded: boolean; abilities: Abilities; onChange: (m: Message) => void }) {
  const [open, setOpen] = useState(false); const [history, setHistory] = useState(false);
  const removed = message.state !== 'ACTIVE';
  return <li className={`message${message.author.id === meId ? ' own' : ''}${removed ? ' removed' : ''}`}>
    <div className="message-meta"><strong>{message.author.name}{!message.author.isActive && ' (pasif)'}</strong><time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
      {message.pinnedAt && <span className="badge">Sabitlendi</span>}
      {message.editedAt && !removed && <button type="button" className="link-button" aria-expanded={history} onClick={() => setHistory(!history)}>(düzenlendi)</button>}</div>
    {removed ? <p className="message-body muted"><em>{messageStateLabels[message.state]}</em>{message.hiddenReason && <> Gerekçe: {message.hiddenReason}</>}</p>
      : <>{message.body && <MessageText body={message.body} mentions={message.mentions} meId={meId} />}
        {message.attachments.length > 0 && <div className="message-files">{message.attachments.map(f => <AttachmentView key={f.id} file={f} />)}</div>}</>}
    {history && !removed && <History id={message.id} />}
    <MessageActions message={message} meId={meId} canPost={canPost} abilities={abilities} onChange={onChange} />
    {threaded && (message.replyCount > 0 || (canPost && !removed)) && <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>{message.replyCount ? `${message.replyCount} yanıt` : 'Yanıtla'}{open ? ' · kapat' : ''}</button>}
    {open && <div className="replies"><MessageStream conversationId={conversationId} parentId={message.id} meId={meId} canPost={canPost && !removed} abilities={abilities} /></div>}
  </li>;
}

/**
 * Newest page is polled; older pages are fetched on demand and merged by sequence number.
 * Reaching the newest message of the top-level stream advances the read marker.
 */
export function MessageStream({ conversationId, parentId, meId, canPost, abilities = { canModerate: false, canSuggestKnowledge: false } }: { conversationId: string; parentId?: string; meId: string; canPost: boolean; abilities?: Abilities }) {
  const cache = useQueryClient(); const live = useLiveIntervals();
  const query = parentId ? `parentId=${parentId}&limit=100` : 'limit=50';
  const latest = useQuery({ queryKey: messagesKey(conversationId, parentId), queryFn: () => api<MessagePage>(`/messaging/conversations/${conversationId}/messages?${query}`), refetchInterval: live.thread, retry: false });
  const [older, setOlder] = useState<Message[]>([]); const [olderMore, setOlderMore] = useState<boolean>(); const [loadError, setLoadError] = useState<unknown>();
  const list = useRef<HTMLOListElement>(null); const lastSeen = useRef(0);
  const items = [...new Map([...older, ...latest.data?.items ?? []].map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq);
  const newest = items.at(-1)?.seq ?? 0;
  // A changed message (edit, delete, pin, moderation) replaces its copy in older pages too; the newest page is refetched.
  const changed = (m: Message) => { setOlder(prev => prev.map(x => x.id === m.id ? { ...m, replyCount: x.replyCount } : x)); void cache.invalidateQueries({ queryKey: ['messaging-messages', conversationId] }); void cache.invalidateQueries({ queryKey: pinsKey(conversationId) }); };
  useEffect(() => {
    const el = list.current; if (!el || parentId || newest <= lastSeen.current) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (lastSeen.current === 0 || nearBottom) el.scrollTop = el.scrollHeight;
    lastSeen.current = newest;
  }, [newest, parentId]);
  useEffect(() => {
    const page = latest.data; if (parentId || !page || page.lastSeq <= page.readSeq || document.visibilityState !== 'visible') return;
    void api(`/messaging/conversations/${conversationId}/read`, 'POST', { seq: page.lastSeq }).then(() => cache.invalidateQueries({ queryKey: conversationsKey })).catch(() => undefined);
  }, [latest.data, conversationId, parentId, cache]);
  const loadOlder = async () => {
    setLoadError(undefined);
    try { const page = await api<MessagePage>(`/messaging/conversations/${conversationId}/messages?limit=50&beforeSeq=${items[0]!.seq}`); setOlder(prev => [...page.items, ...prev]); setOlderMore(page.hasMore); } catch (e) { setLoadError(e); }
  };
  const hasMore = !parentId && (olderMore ?? latest.data?.hasMore);
  return <div className={parentId ? 'thread-replies' : 'message-stream'}>
    <Notice error={latest.error ?? loadError} />
    {hasMore && <button type="button" className="btn load-older" onClick={loadOlder}>Daha eski mesajlar</button>}
    {latest.isLoading ? <p role="status" className="muted">Yükleniyor…</p> : items.length === 0 && <p className="muted message-empty">{parentId ? 'Henüz yanıt yok.' : 'Henüz mesaj yok. İlk mesajı yazın.'}</p>}
    <ol ref={list} className="message-list" role="log" aria-live="polite" aria-label={parentId ? 'Yanıtlar' : 'Mesajlar'}>{items.map(m => <MessageItem key={m.id} message={m} meId={meId} conversationId={conversationId} canPost={canPost} threaded={!parentId} abilities={abilities} onChange={changed} />)}</ol>
    {canPost && <Composer conversationId={conversationId} parentId={parentId} label={parentId ? 'Yanıt yaz' : 'Mesaj yaz'} />}
  </div>;
}

/** Every file sent in the conversation, newest first. */
export function ConversationFiles({ conversationId }: { conversationId: string }) {
  const files = useQuery({ queryKey: filesKey(conversationId), queryFn: () => api<SharedFile[]>(`/messaging/conversations/${conversationId}/attachments`), retry: false });
  if (files.error) return <Notice error={files.error} />;
  if (!files.data) return <p role="status" className="muted">Yükleniyor…</p>;
  if (!files.data.length) return <p className="muted">Bu konuşmada henüz dosya paylaşılmadı.</p>;
  return <ul className="shared-files">{files.data.map(f => <li key={f.id}><AttachmentView file={f} /><small className="muted">{f.uploadedBy.name} · {formatDate(f.createdAt)}</small></li>)}</ul>;
}

/** Pinned messages of a conversation, newest pin first. */
export function PinnedMessages({ conversationId }: { conversationId: string }) {
  const pins = useQuery({ queryKey: pinsKey(conversationId), queryFn: () => api<Message[]>(`/messaging/conversations/${conversationId}/pins`), retry: false });
  if (pins.error) return <Notice error={pins.error} />;
  if (!pins.data) return <p role="status" className="muted">Yükleniyor…</p>;
  if (!pins.data.length) return <p className="muted">Sabitlenmiş mesaj yok. Önemli bir mesajı “İşlemler → Sabitle” ile buraya alabilirsiniz.</p>;
  return <ul className="shared-files">{pins.data.map(m => <li key={m.id}><small className="muted">{m.author.name} · {formatDate(m.createdAt)}</small><MessageText body={m.body || m.attachments.map(a => a.name).join(', ')} mentions={m.mentions} /></li>)}</ul>;
}
