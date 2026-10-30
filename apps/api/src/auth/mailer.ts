import { ServiceUnavailableException } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';
import { parseEnv } from '../env';

export type MailKind = 'INVITE' | 'RESET';
/** Delivery port for auth links. Implementations must never log the URL: it carries a single-use token. */
export abstract class Mailer {
  abstract readonly delivery: 'LOCAL_FILE' | 'SMTP';
  abstract send(email: string, kind: MailKind, url: string): Promise<void>;
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const templates: Record<MailKind, { subject: string; intro: string; action: string; expiry: string }> = {
  INVITE: { subject: 'Altıkod CRM davetiniz', intro: 'Altıkod CRM çalışma alanına davet edildiniz. Hesabınızı etkinleştirmek için parolanızı belirleyin.', action: 'Daveti kabul et', expiry: 'Bağlantı 48 saat geçerlidir ve yalnızca bir kez kullanılabilir.' },
  RESET: { subject: 'Altıkod CRM parola sıfırlama', intro: 'Hesabınız için parola sıfırlama talebi alındı. Talep size ait değilse bu e-postayı yok sayın; parolanız değişmez.', action: 'Yeni parola belirle', expiry: 'Bağlantı 30 dakika geçerlidir ve yalnızca bir kez kullanılabilir.' },
};
export function authMail(kind: MailKind, url: string) {
  const t = templates[kind];
  return {
    subject: t.subject,
    text: `${t.intro}\n\n${t.action}: ${url}\n\n${t.expiry}\n\nAltıkod Digital Solutions`,
    html: `<!doctype html><html lang="tr"><body style="font-family:Arial,sans-serif;color:#2b2422;line-height:1.6"><p>${escape(t.intro)}</p><p><a href="${escape(url)}" style="display:inline-block;background:#d6382a;color:#ffffff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:bold">${escape(t.action)}</a></p><p style="font-size:13px;color:#655b58">${escape(t.expiry)}<br>Bağlantı açılmazsa adresi tarayıcınıza kopyalayın:<br>${escape(url)}</p><p style="font-size:13px">Altıkod Digital Solutions</p></body></html>`,
  };
}

/** Development delivery adapter. No email is sent to third parties. */
export class LocalMail extends Mailer {
  readonly delivery = 'LOCAL_FILE';
  async send(email: string, kind: MailKind, url: string) {
    if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('E-posta adaptörü yapılandırılmadı');
    const directory = resolve(process.env.LOCAL_MAIL_DIR ?? '.local-mail');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(resolve(directory, `${randomUUID()}.json`), JSON.stringify({ to: email, kind, url }, null, 2), { mode: 0o600, flag: 'wx' });
  }
}

export class SmtpMail extends Mailer {
  readonly delivery = 'SMTP';
  constructor(private readonly from: string, private readonly transport: Transporter) { super(); }
  async send(email: string, kind: MailKind, url: string) {
    await this.transport.sendMail({ from: this.from, to: email, ...authMail(kind, url) });
  }
}

export function createMailer(): Mailer {
  // main.ts validates the whole environment at startup; only SMTP needs parsed settings here.
  if ((process.env.MAIL_TRANSPORT ?? 'local') === 'local') return new LocalMail();
  const env = parseEnv(process.env);
  const auth = env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD! } : undefined;
  return new SmtpMail(env.MAIL_FROM!, createTransport({
    host: env.SMTP_HOST, port: env.SMTP_PORT, auth,
    secure: env.SMTP_SECURITY === 'tls', requireTLS: env.SMTP_SECURITY === 'starttls', ignoreTLS: env.SMTP_SECURITY === 'none',
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  }));
}
