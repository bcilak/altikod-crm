'use client';
import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatDate } from '../lib/api';
import { conversationsKey, messageMaxLength, newNonce, threadInterval, type Message, type MessagePage } from '../lib/messaging';
import { Notice } from './ui';

const messagesKey = (conversationId: string, parentId?: string) => ['messaging-messages', conversationId, parentId ?? null];

/** Plain text only: http(s) addresses become links that open in a new tab without referrer; nothing else is interpreted. */
function MessageText({ body }: { body: string }) {
  return <p className="message-body">{body.split(/(https?:\/\/[^\s<>"']+)/g).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    const url = part.replace(/[.,;:!?)]+$/, ''); const rest = part.slice(url.length);
    return <Fragment key={i}><a className="text-link" href={url} target="_blank" rel="noopener noreferrer">{url}</a>{rest}</Fragment>;
  })}</p>;
}

export function Composer({ conversationId, parentId, onSent, label = 'Mesaj yaz' }: { conversationId: string; parentId?: string; onSent?: () => void; label?: string }) {
  const [body, setBody] = useState(''); const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  const nonce = useRef(newNonce()); const cache = useQueryClient();
  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true); setError(undefined);
    try {
      await api(`/messaging/conversations/${conversationId}/messages`, 'POST', { body, clientNonce: nonce.current, ...(parentId ? { parentId } : {}) });
      setBody(''); nonce.current = newNonce();
      await Promise.all([cache.invalidateQueries({ queryKey: ['messaging-messages', conversationId] }), cache.invalidateQueries({ queryKey: conversationsKey })]);
      onSent?.();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } };
  return <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}>
    <label><span className="sr-only">{label}</span><textarea aria-label={label} placeholder={`${label} · Enter gönderir, Shift+Enter yeni satır`} rows={2} maxLength={messageMaxLength} value={body} onChange={e => { setBody(e.target.value); }} onKeyDown={onKey} /></label>
    <div className="composer-actions">{body.length > messageMaxLength - 500 && <small className="muted">{body.length}/{messageMaxLength}</small>}<button className="btn primary" disabled={busy || !body.trim()}>{busy ? 'Gönderiliyor…' : 'Gönder'}</button></div>
    <Notice error={error} />{!!error && <small className="muted">Taslak korundu; tekrar gönderdiğinizde mesaj iki kez kaydedilmez.</small>}
  </form>;
}

function MessageItem({ message, meId, conversationId, canPost, threaded }: { message: Message; meId: string; conversationId: string; canPost: boolean; threaded: boolean }) {
  const [open, setOpen] = useState(false);
  return <li className={`message${message.author.id === meId ? ' own' : ''}`}>
    <div className="message-meta"><strong>{message.author.name}{!message.author.isActive && ' (pasif)'}</strong><time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time></div>
    <MessageText body={message.body} />
    {threaded && (message.replyCount > 0 || canPost) && <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>{message.replyCount ? `${message.replyCount} yanıt` : 'Yanıtla'}{open ? ' · kapat' : ''}</button>}
    {open && <div className="replies"><MessageStream conversationId={conversationId} parentId={message.id} meId={meId} canPost={canPost} /></div>}
  </li>;
}

/**
 * Newest page is polled; older pages are fetched on demand and merged by sequence number.
 * Reaching the newest message of the top-level stream advances the read marker.
 */
export function MessageStream({ conversationId, parentId, meId, canPost }: { conversationId: string; parentId?: string; meId: string; canPost: boolean }) {
  const cache = useQueryClient();
  const query = parentId ? `parentId=${parentId}&limit=100` : 'limit=50';
  const latest = useQuery({ queryKey: messagesKey(conversationId, parentId), queryFn: () => api<MessagePage>(`/messaging/conversations/${conversationId}/messages?${query}`), refetchInterval: threadInterval, retry: false });
  const [older, setOlder] = useState<Message[]>([]); const [olderMore, setOlderMore] = useState<boolean>(); const [loadError, setLoadError] = useState<unknown>();
  const list = useRef<HTMLOListElement>(null); const lastSeen = useRef(0);
  const items = [...new Map([...older, ...latest.data?.items ?? []].map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq);
  const newest = items.at(-1)?.seq ?? 0;
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
    <ol ref={list} className="message-list" role="log" aria-live="polite" aria-label={parentId ? 'Yanıtlar' : 'Mesajlar'}>{items.map(m => <MessageItem key={m.id} message={m} meId={meId} conversationId={conversationId} canPost={canPost} threaded={!parentId} />)}</ol>
    {canPost && <Composer conversationId={conversationId} parentId={parentId} label={parentId ? 'Yanıt yaz' : 'Mesaj yaz'} />}
  </div>;
}
