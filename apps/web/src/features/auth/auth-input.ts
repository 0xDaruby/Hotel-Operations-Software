export function normalizeAuthEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validLoginPassword(value: unknown): value is string {
  // Login must still accept existing passwords; the 12-character minimum is
  // enforced when choosing a NEW password, not retroactively at sign-in.
  return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}

export function authRateLimited(error: { status?: number; code?: string }) {
  return error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit';
}
