'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Me } from '../../../lib/api';
import { conversationKindLabels, conversationsKey, displayName, recordLabels, recordPath, roleLabels, type Colleague, type Conversation, type ConversationDetail, type ConversationKind, type ConversationList } from '../../../lib/messaging';
import { ConversationFiles, MessageStream } from '../../../components/conversation';
import { useLiveIntervals } from '../../../components/live';
import { Action, Badge, Editor, Loading, Notice, Title, useData, useMe } from '../../../components/ui';

const sections: { kind: ConversationKind; title: string; empty: string }[] = [
  { kind: 'CHANNEL', title: 'Kanallar', empty: 'Kanal yok.' },
  { kind: 'DIRECT', title: 'Birebir', empty: 'Henüz birebir mesaj yok.' },
  { kind: 'GROUP', title: 'Özel gruplar', empty: 'Üyesi olduğunuz grup yok.' },
  { kind: 'RECORD', title: 'Takip edilen kayıtlar', empty: 'Firma, fırsat veya proje sayfasındaki “Konuşma” bölümünü açtığınızda burada görünür.' },
];

/** Searchable colleague picker; checkboxes for several people, radio buttons for one. */
function PeoplePicker({ multiple, selected, onChange, exclude = [], noViewer = false }: { multiple: boolean; selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; noViewer?: boolean }) {
  const [search, setSearch] = useState('');
  const { data, error } = useData<Colleague[]>(`/messaging/users${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`);
  const people = (data ?? []).filter(p => !exclude.includes(p.id) && !(noViewer && p.role === 'VIEWER'));
  return <fieldset className="people-picker"><legend>{multiple ? 'Kişiler' : 'Kişi'}</legend>
    <label>Ada göre ara<input value={search} onChange={e => setSearch(e.target.value)} /></label><Notice error={error} />
    <div className="people-options">{people.length === 0 && <p className="muted">Eşleşen kişi yok.</p>}{people.map(p => <label key={p.id} className="check-option"><input type={multiple ? 'checkbox' : 'radio'} name="people" checked={selected.includes(p.id)} onChange={e => onChange(multiple ? e.target.checked ? [...selected, p.id] : selected.filter(id => id !== p.id) : [p.id])} /><span>{p.name} <small className="muted">· {roleLabels[p.role] ?? p.role}</small></span></label>)}</div>
  </fieldset>;
}

function useSubmit(run: () => Promise<void>) {
  const [error, setError] = useState<unknown>(); const [busy, setBusy] = useState(false);
  return { error, busy, submit: async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(undefined); try { await run(); } catch (err) { setError(err); } finally { setBusy(false); } } };
}

function NewConversation({ me, open: go }: { me: Me; open: (id: string) => Promise<void> }) {
  const [direct, setDirect] = useState<string[]>([]);
  const [group, setGroup] = useState({ name: '', topic: '', members: [] as string[] });
  const [channel, setChannel] = useState({ name: '', topic: '', isPublic: true, postingRestricted: false });
  const dm = useSubmit(async () => { const c = await api<Conversation>('/messaging/direct', 'POST', { userId: direct[0] }); setDirect([]); await go(c.id); });
  const grp = useSubmit(async () => { const c = await api<Conversation>('/messaging/conversations', 'POST', { kind: 'GROUP', name: group.name, topic: group.topic, memberIds: group.members }); setGroup({ name: '', topic: '', members: [] }); await go(c.id); });
  const chn = useSubmit(async () => { const c = await api<Conversation>('/messaging/conversations', 'POST', { kind: 'CHANNEL', ...channel }); setChannel({ name: '', topic: '', isPublic: true, postingRestricted: false }); await go(c.id); });
  return <div className="new-conversation">
    <Editor title="Yeni birebir mesaj"><form onSubmit={dm.submit}><PeoplePicker multiple={false} selected={direct} onChange={setDirect} /><Notice error={dm.error} /><button className="btn primary" disabled={dm.busy || !direct.length}>Mesajlaşmaya başla</button></form></Editor>
    {me.role !== 'VIEWER' && <Editor title="Yeni özel grup"><form onSubmit={grp.submit}><label>Grup adı *<input required maxLength={80} value={group.name} onChange={e => setGroup({ ...group, name: e.target.value })} /></label><label>Konu<input maxLength={500} value={group.topic} onChange={e => setGroup({ ...group, topic: e.target.value })} /></label>
      <PeoplePicker multiple selected={group.members} onChange={members => setGroup({ ...group, members })} noViewer /><p className="muted">Grubu yalnız üyeler görür; yöneticiler dahil başkası göremez.</p><Notice error={grp.error} /><button className="btn primary" disabled={grp.busy || !group.members.length || !group.name.trim()}>Grubu oluştur</button></form></Editor>}
    {['ADMIN', 'MANAGER'].includes(me.role) && <Editor title="Yeni kanal"><form onSubmit={chn.submit}><label>Kanal adı *<input required maxLength={80} value={channel.name} onChange={e => setChannel({ ...channel, name: e.target.value })} /><small className="muted">Küçük harfe çevrilir; boşluk yerine - kullanın.</small></label><label>Konu<input maxLength={500} value={channel.topic} onChange={e => setChannel({ ...channel, topic: e.target.value })} /></label>
      <label className="check-option"><input type="checkbox" checked={channel.isPublic} onChange={e => setChannel({ ...channel, isPublic: e.target.checked })} /><span>Herkese açık (herkes görür ve katılabilir)</span></label><label className="check-option"><input type="checkbox" checked={channel.postingRestricted} onChange={e => setChannel({ ...channel, postingRestricted: e.target.checked })} /><span>Yalnız yöneticiler yazabilsin</span></label><Notice error={chn.error} /><button className="btn primary" disabled={chn.busy || !channel.name.trim()}>Kanalı oluştur</button></form></Editor>}
  </div>;
}

function ConversationInfo({ c, me, leave }: { c: ConversationDetail; me: Me; leave: () => Promise<void> }) {
  const [adding, setAdding] = useState<string[]>([]); const cache = useQueryClient();
  const add = useSubmit(async () => { await api(`/messaging/conversations/${c.id}/members`, 'POST', { userIds: adding }); setAdding([]); await cache.invalidateQueries({ queryKey: conversationsKey }); await cache.invalidateQueries({ queryKey: [`/messaging/conversations/${c.id}`] }); });
  const leavable = (c.kind === 'CHANNEL' || c.kind === 'GROUP') && c.joined;
  return <Editor title={c.kind === 'RECORD' ? 'Konuşma bilgisi' : `Konuşma bilgisi · ${c.memberCount} üye`}>
    {c.topic && <p className="prewrap">{c.topic}</p>}
    {c.kind === 'RECORD' && c.record && <p>Bu konuşma <Link className="text-link" href={`${recordPath[c.record.type]}/${c.record.id}`}>{recordLabels[c.record.type].toLocaleLowerCase('tr-TR')} kaydına</Link> bağlıdır. Kayda erişimi olan herkes görür; erişimi kalkan kişi göremez.</p>}
    {c.kind !== 'RECORD' && <ul className="member-list">{c.members.map(m => <li key={m.id} className="record"><span>{m.name}{!m.isActive && ' (pasif)'}{m.role === 'OWNER' && c.kind === 'GROUP' && <> <Badge>Sahip</Badge></>}</span>
      {c.canManage && !c.archivedAt && m.id !== me.id && m.role !== 'OWNER' && c.kind !== 'DIRECT' && <Action confirm={`${m.name} konuşmadan çıkarılsın mı? Geçmiş mesajları göremez.`} run={() => api(`/messaging/conversations/${c.id}/members/${m.id}/remove`, 'POST')}>Çıkar</Action>}</li>)}</ul>}
    {c.canManage && !c.archivedAt && <form onSubmit={add.submit} className="mt-3"><PeoplePicker multiple selected={adding} onChange={setAdding} exclude={c.members.map(m => m.id)} noViewer={c.kind === 'GROUP'} /><p className="muted">Eklenen kişi önceki mesajları da görür.</p><Notice error={add.error} /><button className="btn" disabled={add.busy || !adding.length}>Üye ekle</button></form>}
    <div className="quote-actions">
      {leavable && <Action confirm="Konuşmadan ayrılmak istiyor musunuz?" run={leave}>Ayrıl</Action>}
      {c.canManage && <Action confirm={c.archivedAt ? 'Konuşma arşivden çıkarılsın mı?' : 'Konuşma arşivlensin mi? Mesajlar okunabilir kalır, yeni mesaj yazılamaz.'} run={() => api(`/messaging/conversations/${c.id}`, 'PATCH', { archived: !c.archivedAt })}>{c.archivedAt ? 'Arşivden çıkar' : 'Arşivle'}</Action>}
    </div>
  </Editor>;
}

function ActiveConversation({ id, me, close }: { id: string; me: Me; close: () => void }) {
  const { data: c, error, isLoading } = useData<ConversationDetail>(`/messaging/conversations/${id}`);
  const cache = useQueryClient();
  if (isLoading) return <Loading />;
  if (!c) return <><Notice error={error ?? 'Konuşma bulunamadı.'} /><p className="muted">Konuşma kaldırılmış ya da artık erişiminiz yok.</p></>;
  const blocked = c.archivedAt ? 'Bu konuşma arşivlendi; mesajlar okunabilir, yeni mesaj yazılamaz.'
    : c.kind === 'CHANNEL' && !c.joined ? null
      : c.kind === 'CHANNEL' && c.postingRestricted && !c.canPost ? 'Bu kanala yalnız yöneticiler yazar.'
        : !c.canPost ? 'Bu konuşmayı okuyabilirsiniz; yazma yetkiniz yok.' : null;
  return <section className="chat-main" aria-label={displayName(c)}>
    <header className="chat-header"><button type="button" className="btn chat-back" onClick={close}>← Konuşmalar</button>
      <div><h2>{displayName(c)}</h2><p className="muted">{c.record ? `${recordLabels[c.record.type]} konuşması` : conversationKindLabels[c.kind]}{c.kind === 'CHANNEL' && !c.isPublic ? ' · özel' : ''}{c.topic ? ` · ${c.topic}` : ''}</p></div></header>
    {c.kind === 'CHANNEL' && !c.joined && !c.archivedAt && <div className="notice">Bu kanalı okuyabilirsiniz. Yazmak ve okunmamış sayısını görmek için katılın. <Action run={async () => { await api(`/messaging/conversations/${c.id}/join`, 'POST'); await cache.invalidateQueries(); }}>Kanala katıl</Action></div>}
    {blocked && <p className="notice">{blocked}</p>}
    <MessageStream key={c.id} conversationId={c.id} meId={me.id} canPost={c.canPost} />
    <Editor title="Dosyalar"><ConversationFiles conversationId={c.id} /></Editor>
    <ConversationInfo c={c} me={me} leave={async () => { await api(`/messaging/conversations/${c.id}/leave`, 'POST'); close(); }} />
  </section>;
}

function Messages() {
  const params = useSearchParams(); const router = useRouter(); const cache = useQueryClient(); const { data: me } = useMe(); const live = useLiveIntervals();
  const active = params.get('c');
  const list = useQuery({ queryKey: conversationsKey, queryFn: () => api<ConversationList>('/messaging/conversations'), refetchInterval: live.list, retry: false });
  // Remounting the creation forms after a successful create closes and clears them.
  const [formsKey, setFormsKey] = useState(0);
  const go = async (id: string) => { await cache.invalidateQueries({ queryKey: conversationsKey }); setFormsKey(k => k + 1); router.push(`/messages?c=${id}`); };
  if (!me) return <Loading />;
  return <><Title title="Mesajlar" subtitle="Ekip içi yazışma: kanallar, birebir mesajlar, özel gruplar ve firma, fırsat, proje kayıtlarına bağlı konuşmalar. Yeni mesajlar anında görünür; canlı bağlantı koparsa birkaç saniyede bir yenilenir." />
    <div className={`chat-layout${active ? ' has-active' : ''}`}>
      <nav className="chat-list" aria-label="Konuşmalar">
        <Notice error={list.error} />{list.isLoading && <Loading />}
        {list.data && sections.map(s => { const items = list.data.items.filter(c => c.kind === s.kind); return <section key={s.kind}><h2>{s.title}</h2>{items.length === 0 ? <p className="muted chat-empty">{s.empty}</p> : <ul>{items.map(c => <li key={c.id}>
          <Link href={`/messages?c=${c.id}`} className="chat-link" aria-current={c.id === active ? 'page' : undefined}><span className="chat-name">{displayName(c)}{c.archivedAt && <small className="muted"> · arşiv</small>}{c.kind === 'CHANNEL' && !c.joined && <small className="muted"> · katılmadınız</small>}{c.record && <small className="muted block">{recordLabels[c.record.type]}</small>}</span>
            {c.unread > 0 && <span className="unread" aria-label={`${c.unread} okunmamış mesaj`}>{c.unread > 99 ? '99+' : c.unread}</span>}</Link></li>)}</ul>}</section>; })}
        <NewConversation key={formsKey} me={me} open={go} />
      </nav>
      {active ? <ActiveConversation key={active} id={active} me={me} close={() => router.push('/messages')} /> : <section className="chat-main chat-placeholder"><p className="muted">Soldan bir konuşma seçin veya yeni bir konuşma başlatın.</p></section>}
    </div></>;
}
export default function MessagesRoute() { return <Suspense fallback={<Loading />}><Messages /></Suspense>; }
