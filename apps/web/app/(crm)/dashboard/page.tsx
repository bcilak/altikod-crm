'use client';
import Link from 'next/link';
import ReportView from '../../../components/report-view';
import { formatDate, type Page, type Task } from '../../../lib/api';
import { Empty, Loading, Notice, Panel, Title, useData, useMe } from '../../../components/ui';
export default function Dashboard() {
  const { data: me } = useMe(); const { data, error, isLoading } = useData<Page<Task>>(`/tasks?assigneeId=${me?.id}&status=OPEN`, !!me);
  return <><div className="dashboard-hero"><Title title="Bugün neye odaklanıyoruz?" subtitle="Müşteri ilişkilerinden kazanılan işe: satışın tüm adımları bir arada." /></div><div className="dashboard-content">{me && ["ADMIN","MANAGER","SALES"].includes(me.role) && <div className="dashboard-report"><ReportView compact /></div>}<div className="dashboard-work"><div className="dashboard-links"><Link href="/tasks" className="panel">Görevlerimi yönet →</Link>{me?.role !== 'TECHNICAL' && <><Link className="panel" href="/companies">Müşterilerime git →</Link><Link className="panel" href="/opportunities">Satış fırsatlarını aç →</Link></>}</div><Panel title="Sıradaki takipler"><Notice error={error} />{isLoading && <Loading />}{data?.items.length === 0 && <Empty>Açık göreviniz yok.</Empty>}<div className="record-list">{data?.items.map(task => <Link key={task.id} href={`/tasks?task=${task.id}`} className="record"><div><strong>{task.title}</strong><p className="muted">{task.company.displayName}</p></div><span>{formatDate(task.dueAt)}</span></Link>)}</div></Panel></div></div></>;
}
