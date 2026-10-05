type RefreshDependencies = {
  isActive: () => boolean;
  refresh: () => void;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (timer: number) => void;
};

/** Serial polling; completion is signalled when the React refresh transition settles. */
export function createRefreshController(dependencies: RefreshDependencies) {
  let timer: number | undefined;
  let busy = false;
  let disposed = false;

  function clear() {
    if (timer !== undefined) dependencies.cancel(timer);
    timer = undefined;
  }

  function schedule() {
    clear();
    if (disposed || busy || !dependencies.isActive()) return;
    timer = dependencies.schedule(() => {
      timer = undefined;
      request();
    }, 4000);
  }

  function request() {
    clear();
    if (disposed || busy || !dependencies.isActive()) return;
    busy = true;
    try {
      dependencies.refresh();
    } catch (error) {
      busy = false;
      schedule();
      throw error;
    }
  }

  return {
    start: schedule,
    recover: request,
    complete() {
      busy = false;
      schedule();
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
