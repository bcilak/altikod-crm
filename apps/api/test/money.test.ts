import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote, QuoteInput } from '../src/sales/money';
const base: QuoteInput = { title: 'Test', currency: 'TRY', validUntil: '2030-01-01T00:00:00Z', terms: '', discountPct: '0', items: [{ description: 'A', quantity: '3', unitPrice: '0.335', discountPct: '0', taxPct: '20', unitCost: '0.1' }] };
test('decimal money uses half-up cents and tax after discounts', () => {
  const result = calculateQuote(base);
  assert.equal(result.subtotal, '1.01'); assert.equal(result.taxTotal, '0.20'); assert.equal(result.total, '1.21'); assert.equal(result.costTotal, '0.30');
  const mixed = calculateQuote({ ...base, discountPct: '10', items: [{ ...base.items[0]!, quantity: '1', unitPrice: '100', discountPct: '10' }, { ...base.items[0]!, quantity: '1', unitPrice: '100', taxPct: '10' }] });
  assert.equal(mixed.total, '196.20'); assert.equal(mixed.discountTotal, '29.00'); assert.equal(mixed.effectiveDiscount, '19.0000');
});
test('global discount allocates remainder deterministically and unknown cost cannot imply margin', () => {
  const input = { ...base, discountPct: '10', items: [1, 2, 3].map(i => ({ ...base.items[0]!, description: String(i), quantity: '1', unitPrice: '0.05', unitCost: null })) };
  const result = calculateQuote(input); assert.deepEqual(result.lines.map(l => l.net), ['0.04', '0.04', '0.05']); assert.equal(result.marginPct, null);
  assert.deepEqual(result, calculateQuote(input));
  assert.throws(() => calculateQuote({ ...base, items: [{ ...base.items[0]!, quantity: '999999999999', unitPrice: '999999999999' }] }));
});
