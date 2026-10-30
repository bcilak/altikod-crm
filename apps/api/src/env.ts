import { z } from 'zod';

// Compose passes unset optional variables as empty strings.
const optional = <T extends z.ZodType>(type: T) => z.preprocess(value => value === '' ? undefined : value, type.optional());
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.enum(['127.0.0.1', '0.0.0.0']).default('127.0.0.1'),
  APP_ORIGIN: z.string().url().refine(value => new URL(value).origin === value, 'Use an origin without a trailing path').default('http://localhost:3000'),
  DATABASE_URL: z.string().url().refine(value => /^postgres(ql)?:\/\//.test(value)),
  MAIL_TRANSPORT: z.enum(['local', 'smtp']).default('local'),
  SMTP_HOST: optional(z.string().min(1)),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURITY: z.enum(['starttls', 'tls', 'none']).default('starttls'),
  SMTP_USER: optional(z.string().min(1)),
  SMTP_PASSWORD: optional(z.string().min(1)),
  MAIL_FROM: optional(z.string().min(3).max(200)),
  MALWARE_SCANNER: z.enum(['none', 'clamd']).default('none'),
  CLAMD_HOST: optional(z.string().min(1)),
  CLAMD_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === 'production' && !value.APP_ORIGIN.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'Production requires HTTPS' });
  if (value.NODE_ENV === 'production' && value.MAIL_TRANSPORT !== 'smtp') ctx.addIssue({ code: 'custom', path: ['MAIL_TRANSPORT'], message: 'Production requires SMTP delivery' });
  if (value.NODE_ENV === 'production' && value.MALWARE_SCANNER !== 'clamd') ctx.addIssue({ code: 'custom', path: ['MALWARE_SCANNER'], message: 'Production requires malware scanning of shared files' });
  if (value.MALWARE_SCANNER === 'clamd' && !value.CLAMD_HOST) ctx.addIssue({ code: 'custom', path: ['CLAMD_HOST'], message: 'Required for clamd' });
  if (value.MAIL_TRANSPORT === 'smtp') {
    for (const field of ['SMTP_HOST', 'MAIL_FROM'] as const) if (!value[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required for SMTP' });
    if (!value.SMTP_USER !== !value.SMTP_PASSWORD) ctx.addIssue({ code: 'custom', path: ['SMTP_PASSWORD'], message: 'SMTP user and password go together' });
    if (value.NODE_ENV === 'production' && value.SMTP_SECURITY === 'none') ctx.addIssue({ code: 'custom', path: ['SMTP_SECURITY'], message: 'Production requires encrypted SMTP' });
  }
});

export function parseEnv(input: NodeJS.ProcessEnv) {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Only field names, never credentials or rejected input values.
    throw new Error(`Invalid environment fields: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`);
  }
  return result.data;
}
