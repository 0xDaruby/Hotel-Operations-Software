export function validateSetupPassword(password: unknown, confirmation: unknown): string | null {
  if (typeof password !== 'string' || typeof confirmation !== 'string') return 'Enter and confirm your new password.';
  if (password.length < 12 || password.length > 72) return 'Use a password between 12 and 72 characters.';
  if (password !== confirmation) return 'The passwords do not match.';
  return null;
}

export async function completePasswordSetup(dependencies: {
  updatePassword: () => Promise<{ error: string | null }>;
  enableProfile: () => Promise<{ error: string | null }>;
}): Promise<{ ok: boolean; error?: string }> {
  const updated = await dependencies.updatePassword();
  if (updated.error) return { ok: false, error: updated.error };
  const enabled = await dependencies.enableProfile();
  if (enabled.error) return { ok: false, error: 'Your password was saved, but staff access could not be enabled. Try again or contact the Owner / Manager.' };
  return { ok: true };
}
