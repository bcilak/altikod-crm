'use client';
import { api, stageLabels, type Opportunity } from '../lib/api';
import { FieldsForm, options } from './ui';
export default function Transition({ opportunity, target }: { opportunity: Opportunity; target?: string }) {
  return <FieldsForm key={`${opportunity.version}-${target}`} fields={[{ name: 'stage', label: 'Yeni aşama', type: 'select', required: true, options: options(stageLabels).filter(o => o.value !== opportunity.stage) }, { name: 'reason', label: 'Kayıp / manuel kazanım / yeniden açma gerekçesi', type: 'textarea' }, { name: 'nextActionAt', label: 'Sonraki aksiyon (yeniden açarken zorunlu)', type: 'datetime-local' }]} initial={{ stage: target }} label="Aşamayı değiştir" onSave={b => api(`/opportunities/${opportunity.id}/stage-transitions`, 'POST', { ...b, version: opportunity.version })} />;
}
