'use client';
import { useState } from 'react';
import { formatDate, type Page } from '../../../../lib/api';
import { Notice, Pager, Title, useData, useMe } from '../../../../components/ui';
type Audit = { id: string; actorId?: string; action: string; entity: string; entityId?: string; createdAt: string; metadata: object };
export default function AuditPage() { const [page, setPage] = useState(1); const { data: me } = useMe(); const { data, error } = useData<Page<Audit>>(`/audit-logs?page=${page}`, me?.role === 'ADMIN'); return <><Title title="Denetim kaydı" subtitle="Kritik işlem metadatası. Parola, token ve serbest metinler kaydedilmez." /><Notice error={error} /><div className="table-wrap"><table><thead><tr><th>Zaman</th><th>İşlem</th><th>Kaynak</th><th>Kullanıcı ID</th><th>Metadata</th></tr></thead><tbody>{data?.items.map(a => <tr key={a.id}><td>{formatDate(a.createdAt)}</td><td>{a.action}</td><td>{a.entity}</td><td>{a.actorId ?? '—'}</td><td><code>{JSON.stringify(a.metadata)}</code></td></tr>)}</tbody></table></div>{data && <Pager page={page} total={data.total} setPage={setPage} />}</>; }
