'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRefreshController } from './refresh-controller';
import { createClient } from '@/lib/supabase/client';
import { enforceStaffSession, staffAccessStates, type StaffAccessState } from '@/features/auth/session-access';

/** Refreshes server data without reloading the page or resetting client form state. */
export function OperationsRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const controller = useRef<ReturnType<typeof createRefreshController> | null>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    let disposed = false;
    const refresh = createRefreshController({
      isActive: () => document.visibilityState === 'visible' && navigator.onLine,
      refresh: () => {
        void enforceStaffSession({
          check: async () => {
            const response = await fetch('/auth/staff-access', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8_000) });
            if (!response.ok) throw Error('Access check unavailable.');
            const result: { status?: unknown } = await response.json();
            if (typeof result.status !== 'string' || !staffAccessStates.includes(result.status as StaffAccessState)) throw Error('Invalid access response.');
            if (disposed) throw Error('View disposed.');
            return result.status as StaffAccessState;
          },
          clearLocalSession: async () => { await createClient().auth.signOut({ scope: 'local' }); },
          leave: reason => { if (!disposed) window.location.replace(`/login?reason=${encodeURIComponent(reason)}`); },
        }).then(allowed => {
          if (disposed) return;
          if (allowed) startTransition(() => router.refresh());
          else refresh.complete();
        }).catch(() => { if (!disposed) refresh.complete(); });
      },
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      cancel: (timer) => window.clearTimeout(timer),
    });
    controller.current = refresh;
    const recover = () => refresh.recover();
    window.addEventListener('focus', recover);
    window.addEventListener('online', recover);
    window.addEventListener('offline', recover);
    document.addEventListener('visibilitychange', recover);
    refresh.start();
    return () => {
      disposed = true;
      refresh.dispose();
      controller.current = null;
      window.removeEventListener('focus', recover);
      window.removeEventListener('online', recover);
      window.removeEventListener('offline', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [router]);

  useEffect(() => {
    if (wasPending.current && !pending) controller.current?.complete();
    wasPending.current = pending;
  }, [pending]);

  return null;
}
