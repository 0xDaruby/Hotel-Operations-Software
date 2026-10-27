import { normalizeAuthEmail } from './auth-input';

export const RECOVERY_CONFIRMATION = 'If this email is registered, a password-reset link will be sent. Check your inbox and spam folder.';

export async function requestPasswordRecovery(email: unknown, send: (email: string) => Promise<{ error: { status?: number } | null }>) {
  const normalized = normalizeAuthEmail(email);
  if (!normalized) return { ok: false, error: 'Enter a valid email address of up to 254 characters.' };
  try {
    const { error } = await send(normalized);
    // Account-specific errors and email cooldowns must not reveal whether an
    // address exists. Only a provider/network outage is surfaced separately.
    if (error && (error.status === 0 || (error.status ?? 0) >= 500)) {
      return { ok: false, error: 'Password recovery is temporarily unavailable. Try again shortly.' };
    }
    return { ok: true, message: RECOVERY_CONFIRMATION };
  } catch {
    return { ok: false, error: 'We could not request recovery. Check your connection and try again.' };
  }
}

/** Claim is one-use and fences older JWTs before any password mutation. */
export async function completePasswordRecovery(dependencies: {
  claim: () => Promise<string>;
  update: () => Promise<boolean>;
  finish: (sessionId: string, saved: boolean) => Promise<void>;
}) {
  let sessionId: string;
  try { sessionId = await dependencies.claim(); }
  catch { return { ok: false, error: 'This reset session is invalid, expired or already used. Request a new reset link.' }; }
  let saved = false;
  try { saved = await dependencies.update(); } catch { /* Cleanup still runs after a provider failure. */ }
  try { await dependencies.finish(sessionId, saved); }
  catch {
    return { ok: false, error: saved
      ? 'Your password was saved, but session cleanup could not be confirmed. Sign in again or contact the Owner / Manager.'
      : 'Password recovery could not finish. Request a new reset link or contact the Owner / Manager.' };
  }
  return saved ? { ok: true } : { ok: false, error: 'The password change could not be confirmed. Request a new reset link, or try signing in if you already saved a new password.' };
}
