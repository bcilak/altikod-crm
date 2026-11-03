import type { CookieOptions } from 'express';
export const SESSION_IDLE_MS = 7 * 24 * 3600_000;
export const SESSION_MAX_MS = 30 * 24 * 3600_000;
export const SESSION_REFRESH_MS = 3600_000;
export const sessionCookie = (maxAge: number): CookieOptions => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge });
