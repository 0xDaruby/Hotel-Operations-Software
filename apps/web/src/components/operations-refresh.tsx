'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createRefreshController } from './refresh-controller';

/** Refreshes server data without reloading the page or resetting client form state. */
export function OperationsRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const controller = useRef<ReturnType<typeof createRefreshController> | null>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    const refresh = createRefreshController({
      isActive: () => document.visibilityState === 'visible' && navigator.onLine,
      refresh: () => startTransition(() => router.refresh()),
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
