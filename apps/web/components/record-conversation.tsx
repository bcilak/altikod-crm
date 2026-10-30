'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { conversationsKey, type ConversationDetail, type RecordType } from '../lib/messaging';
import { MessageStream } from './conversation';
import { Notice, useMe } from './ui';

/**
 * “Konuşma” section of a company, opportunity or project page. Opening it creates the conversation on first use and follows it;
 * merely viewing the record does neither. Visibility and posting rights come from the record's own scope on the server.
 */
export function RecordConversation({ recordType, recordId }: { recordType: RecordType; recordId: string }) {
  const [open, setOpen] = useState(false); const { data: me } = useMe();
  const conversation = useQuery({ queryKey: [...conversationsKey, 'record', recordType, recordId], queryFn: () => api<ConversationDetail>('/messaging/record-conversations', 'POST', { recordType, recordId }), enabled: open, retry: false, staleTime: 60_000 });
  const c = conversation.data;
  return <details className="panel editor record-conversation" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Konuşma</summary>
    <div className="pt-4">
      <Notice error={conversation.error} />{conversation.isLoading && <p role="status" className="muted">Yükleniyor…</p>}
      {c && me && <>
        <p className="muted record-conversation-note">Bu kayda erişimi olan herkes bu konuşmayı görür; erişimi kalkan kişi göremez. <Link className="text-link" href={`/messages?c=${c.id}`}>Mesajlar’da aç</Link></p>
        {!c.canPost && <p className="notice">{c.archivedAt ? 'Konuşma arşivlendi.' : 'Bu konuşmayı okuyabilirsiniz; yazma yetkiniz yok.'}</p>}
        <MessageStream conversationId={c.id} meId={me.id} canPost={c.canPost} />
      </>}
    </div>
  </details>;
}
