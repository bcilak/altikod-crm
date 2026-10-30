import { z } from 'zod';
export * from './crm';
export * from './sales';
export * from './delivery';

export const healthSchema = z.object({ status: z.literal('ok'), service: z.literal('saleshub-api') });
export type HealthResponse = z.infer<typeof healthSchema>;
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
