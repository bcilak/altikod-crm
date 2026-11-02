'use client';
import { createContext, useContext, useState, type Dispatch, type SetStateAction, type ReactNode } from 'react';
type Drafts = Record<string, unknown>;
const Context = createContext<{ drafts: Drafts; update: Dispatch<SetStateAction<Drafts>> } | null>(null);
/** Session memory only: navigation keeps unfinished notes; logout/reload clears them. Never persisted on the device. */
export function WorkingDrafts({ children }: { children: ReactNode }) {
  const [drafts, update] = useState<Drafts>({});
  return <Context.Provider value={{ drafts, update }}>{children}</Context.Provider>;
}
export function useWorkingDraft<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(Context);
  if (!context) throw new Error('WorkingDrafts provider required');
  const value = (key in context.drafts ? context.drafts[key] : initial) as T;
  const set: Dispatch<SetStateAction<T>> = action => context.update(previous => {
    const current = (key in previous ? previous[key] : initial) as T;
    return { ...previous, [key]: typeof action === 'function' ? (action as (value: T) => T)(current) : action };
  });
  return [value, set];
}
