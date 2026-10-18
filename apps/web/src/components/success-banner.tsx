'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { XIcon } from '@/components/icons';
import { createBannerTimer, SUCCESS_BANNER_DURATION } from './success-banner-timer';

type Confirmation = { id: number; message: string; detail?: string };
const SuccessContext = createContext<((message: string, detail?: string) => void) | null>(null);

export function useSuccessBanner() {
  const notify = useContext(SuccessContext);
  if (!notify) throw new Error('Success feedback requires SuccessBannerProvider.');
  return notify;
}

export function SuccessBannerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Confirmation[]>([]);
  const nextId = useRef(0);
  const notify = useCallback((message: string, detail?: string) => {
    if (!message.trim()) return;
    const confirmation = { id: ++nextId.current, message, detail: detail?.trim() || undefined };
    setQueue(previous => [...previous, confirmation]);
  }, []);
  const dismiss = useCallback((id: number) => setQueue(previous => previous.filter(item => item.id !== id)), []);
  const current = queue[0];
  return <SuccessContext.Provider value={notify}>
    {children}
    <div className="success-announcer" role="status" aria-live="polite" aria-atomic="true">{current ? <span key={current.id}>{current.message}{current.detail ? ` · ${current.detail}` : ''}</span> : null}</div>
    {current ? <SuccessBanner key={current.id} confirmation={current} onDismiss={dismiss} /> : null}
  </SuccessContext.Provider>;
}

export function SuccessBanner({ confirmation, onDismiss }: { confirmation: Confirmation; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof createBannerTimer> | null>(null);
  const dismiss = useCallback(() => setLeaving(true), []);
  useEffect(() => {
    const controller = createBannerTimer(SUCCESS_BANNER_DURATION, dismiss);
    timer.current = controller;
    function visibility() {
      if (document.hidden) controller.pause('hidden');
      else controller.resume('hidden');
    }
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { controller.dispose(); timer.current = null; document.removeEventListener('visibilitychange', visibility); };
  }, [dismiss]);
  useEffect(() => {
    if (!leaving) return;
    timer.current?.dispose();
    const timeout = setTimeout(() => onDismiss(confirmation.id), 180);
    return () => clearTimeout(timeout);
  }, [leaving, confirmation.id, onDismiss]);

  return <div className={`success-banner${leaving ? ' success-banner-leaving' : ''}`} role="group" aria-label="Confirmation"
    onMouseEnter={() => timer.current?.pause('hover')} onMouseLeave={() => timer.current?.resume('hover')}
    onFocusCapture={() => timer.current?.pause('focus')}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) timer.current?.resume('focus'); }}>
    <span className="success-banner-check" aria-hidden="true">✓</span>
    <div className="success-banner-copy">
      <p className="success-banner-message">{confirmation.message}</p>
      {confirmation.detail ? <p className="success-banner-detail" title={confirmation.detail}>{confirmation.detail}</p> : null}
    </div>
    <button type="button" aria-label="Dismiss confirmation" onClick={dismiss}><XIcon className="icon icon-sm" aria-hidden="true" /></button>
  </div>;
}
