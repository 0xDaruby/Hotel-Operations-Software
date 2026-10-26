export const staffAccessStates = ['ready', 'signed-out', 'missing', 'inactive', 'invalid-role', 'setup-pending', 'revoked', 'deleted'] as const;
export type StaffAccessState = typeof staffAccessStates[number];

export function isTransientAuthError(error: { status?: number; name?: string }): boolean {
  return !error.status || error.status === 408 || error.status === 429 || error.status >= 500 || error.name === 'AuthRetryableFetchError';
}

/** A transport failure is not evidence of revoked access. Retry without discarding work. */
export async function enforceStaffSession(dependencies: {
  check: () => Promise<StaffAccessState>;
  clearLocalSession: () => Promise<void>;
  leave: (reason: Exclude<StaffAccessState, 'ready'>) => void;
  clearTimeoutMs?: number;
}): Promise<boolean> {
  let state: StaffAccessState;
  try { state = await dependencies.check(); }
  catch { return false; }
  if (state === 'ready') return true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      dependencies.clearLocalSession(),
      new Promise<void>(resolve => { timeout = setTimeout(resolve, dependencies.clearTimeoutMs ?? 3_000); }),
    ]);
  }
  catch { /* Revoked storage may already be absent; still leave the protected workspace. */ }
  finally { clearTimeout(timeout); dependencies.leave(state); }
  return false;
}
