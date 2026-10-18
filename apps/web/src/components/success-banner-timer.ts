export const SUCCESS_BANNER_DURATION = 6000;

type Clock = {
  now: () => number;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
};

/** Multiple pause reasons can overlap (hover, keyboard focus, hidden tab). */
export function createBannerTimer(duration: number, onExpire: () => void, clock: Clock = {
  now: Date.now,
  schedule: (callback, delay) => setTimeout(callback, delay),
  cancel: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}) {
  let remaining = duration;
  let started = clock.now();
  let handle: unknown;
  let running = false;
  let disposed = false;
  const pauses = new Set<string>();
  function start() {
    if (disposed || running || pauses.size) return;
    running = true;
    started = clock.now();
    handle = clock.schedule(() => {
      if (disposed || !running) return;
      running = false;
      disposed = true;
      onExpire();
    }, Math.max(0, remaining));
  }
  start();
  return {
    pause(reason: string) {
      pauses.add(reason);
      if (running) {
        remaining = Math.max(0, remaining - (clock.now() - started));
        clock.cancel(handle);
        running = false;
      }
    },
    resume(reason: string) { pauses.delete(reason); start(); },
    dispose() { disposed = true; if (running) clock.cancel(handle); running = false; },
  };
}
