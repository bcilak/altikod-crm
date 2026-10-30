'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { conversationsKey, filesKey, listInterval, pinsKey, threadInterval } from '../lib/messaging';

type LiveState = 'connecting' | 'live' | 'offline';
const LiveContext = createContext<LiveState>('connecting');
/** Polling is only a safety net while the live stream is connected; without it the earlier 10/15 s polling applies. */
export function useLiveIntervals() {
  const state = useContext(LiveContext); const connected = state === 'live';
  return { connected, offline: state === 'offline', list: connected ? 60_000 : listInterval, thread: connected ? 60_000 : threadInterval };
}

/**
 * One EventSource per tab. Events only name what changed; the matching queries are refetched through the normal
 * authorised endpoints. After any (re)connect everything messaging-related is refetched, so nothing missed while
 * offline is lost. A closed stream (e.g. server restart, 503) is retried with backoff.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient(); const [state, setState] = useState<LiveState>('connecting');
  useEffect(() => {
    let source: EventSource | undefined; let retry: ReturnType<typeof setTimeout> | undefined; let delay = 5_000; let stopped = false;
    const refresh = (keys: unknown[][]) => { for (const queryKey of keys) void cache.invalidateQueries({ queryKey }); };
    const connect = () => {
      source = new EventSource('/api/v1/messaging/stream');
      source.addEventListener('ready', () => { delay = 5_000; setState('live'); refresh([conversationsKey, ['messaging-messages'], ['/notifications']]); });
      source.addEventListener('message', e => { const { conversationId } = JSON.parse((e as MessageEvent).data); refresh([conversationsKey, ['messaging-messages', conversationId], filesKey(conversationId)]); });
      source.addEventListener('attachment', e => { const { conversationId } = JSON.parse((e as MessageEvent).data); refresh([['messaging-messages', conversationId], filesKey(conversationId)]); });
      source.addEventListener('update', e => { const { conversationId } = JSON.parse((e as MessageEvent).data); refresh([['messaging-messages', conversationId], filesKey(conversationId), pinsKey(conversationId), ['messaging-revisions']]); });
      source.addEventListener('notification', () => refresh([['/notifications']]));
      source.onerror = () => {
        setState('offline');
        if (source?.readyState === EventSource.CLOSED && !stopped) { source.close(); retry = setTimeout(connect, delay); delay = Math.min(delay * 2, 60_000); }
      };
    };
    connect();
    return () => { stopped = true; source?.close(); if (retry) clearTimeout(retry); };
  }, [cache]);
  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}
