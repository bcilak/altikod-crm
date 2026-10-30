'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatDate, money, type Page } from '../../../lib/api';
import { type Quote, quoteStatuses } from '../../../lib/sales';
import { Badge, Editor, Empty, Loading, Notice, Pager, Title, useData, useMe } from '../../../components/ui';
import QuoteForm from '../../../components/quote-form';
export default function QuotesPage() {
  const { data: me } = useMe(); const [page, setPage] = useState(1); const [search, setSearch] = useState(''); const router = useRouter(); const { data, error, isLoading } = useData<Page<Quote>>(`/quotes?page=${page}&search=${encodeURIComponent(search)}`);
  return <><Title title="Teklifler" subtitle="Bir taslaktan müşteri kabulüne. Her revizyon kendi geçmişini korur." />{me?.role !== 'VIEWER' && <Editor title="Yeni teklif"><QuoteForm finance={['ADMIN', 'MANAGER'].includes(me?.role ?? '')} onSaved={q => router.push(`/quotes/${q.id}`)} /></Editor>}<div className="toolbar"><label>Başlıkta ara<input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label></div><Notice error={error} />{isLoading && <Loading />}{data?.items.length === 0 && <Empty>İlk teklifinizi bir satış fırsatına bağlayarak oluşturun.</Empty>}<div className="table-wrap"><table><thead><tr><th>Teklif</th><th>Firma</th><th>Durum</th><th>Toplam</th><th>Geçerlilik</th></tr></thead><tbody>{data?.items.map(q => { const v = q.versions[0]!; return <tr key={q.id}><td><Link href={`/quotes/${q.id}`} className="text-link">{q.quoteNumber} · V{q.currentVersion}</Link><small>{v.title}</small></td><td>{q.company.displayName}</td><td><Badge>{quoteStatuses[v.status]}</Badge></td><td>{money(v.total, v.currency)}</td><td>{formatDate(v.validUntil)}</td></tr>; })}</tbody></table></div>{data && <Pager page={page} total={data.total} setPage={setPage} />}</>;
}
