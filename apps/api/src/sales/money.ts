import Decimal from 'decimal.js';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { quoteContentSchema } from '@saleshub/shared';
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const decimal = (v: Decimal.Value) => new D(v);
const round = (v: Decimal) => v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export type QuoteInput = z.infer<typeof quoteContentSchema>;
export function calculateQuote(input: QuoteInput) {
  const initial = input.items.map(line => {
    const gross = round(decimal(line.quantity).mul(line.unitPrice));
    const discount = round(gross.mul(line.discountPct).div(100));
    return { gross, net: gross.minus(discount) };
  });
  const sum = (values: Decimal[]) => values.reduce((total, value) => total.plus(value), decimal(0));
  const before = sum(initial.map(l => l.net));
  const globalDiscount = round(before.mul(input.discountPct).div(100));
  const allocations = initial.map(l => before.isZero() ? decimal(0) : l.net.mul(globalDiscount).div(before).toDecimalPlaces(2, Decimal.ROUND_DOWN));
  let remainder = globalDiscount.minus(sum(allocations));
  for (let i = 0; remainder.gt(0) && i < allocations.length; i++) {
    if (initial[i]!.net.gt(allocations[i]!)) { allocations[i] = allocations[i]!.plus('0.01'); remainder = remainder.minus('0.01'); }
  }
  const lines = input.items.map((line, position) => {
    const net = initial[position]!.net.minus(allocations[position]!);
    const tax = round(net.mul(line.taxPct).div(100));
    return { ...line, position, net: net.toFixed(2), tax: tax.toFixed(2), total: net.plus(tax).toFixed(2) };
  });
  const subtotal = sum(initial.map(l => l.gross)); const netTotal = sum(lines.map(l => decimal(l.net)));
  const taxTotal = sum(lines.map(l => decimal(l.tax))); const total = netTotal.plus(taxTotal);
  const costTotal = input.items.every(l => l.unitCost != null) ? sum(input.items.map(l => round(decimal(l.quantity).mul(l.unitCost!)))) : null;
  const marginPct = costTotal && netTotal.gt(0) ? netTotal.minus(costTotal).div(netTotal).mul(100).toDecimalPlaces(4) : null;
  const effectiveDiscount = Decimal.max(...input.items.map(l => decimal(100).minus(decimal(100).minus(l.discountPct).mul(decimal(100).minus(input.discountPct)).div(100))));
  if ([subtotal, total, costTotal ?? decimal(0), marginPct ?? decimal(0)].some(v => v.abs().gte('100000000000000'))) throw new BadRequestException('Teklif tutarı desteklenen aralığı aşıyor');
  return { lines, subtotal: subtotal.toFixed(2), discountTotal: subtotal.minus(netTotal).toFixed(2), taxTotal: taxTotal.toFixed(2), total: total.toFixed(2), costTotal: costTotal?.toFixed(2) ?? null, marginPct: marginPct?.toFixed(4) ?? null, effectiveDiscount: effectiveDiscount.toFixed(4) };
}
