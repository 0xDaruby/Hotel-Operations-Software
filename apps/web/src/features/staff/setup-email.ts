type SetupUser = { id: string; email?: string; email_confirmed_at?: string };

/** Authorization comes from provisioning or the owner-only pending-staff RPC before this runs. */
export async function sendStaffSetupEmail(userId: string, email: string, dependencies: {
  getUser: (id: string) => Promise<SetupUser>;
  invite: (email: string) => Promise<SetupUser>;
  recoverLegacy: (email: string) => Promise<void>;
}) {
  const user = await dependencies.getUser(userId);
  if (user.id !== userId || user.email?.toLowerCase() !== email.toLowerCase()) {
    throw Error('Staff setup identity changed. Refresh and retry.');
  }
  // An opened invitation confirms email before password setup finishes. Older
  // pending accounts were also pre-confirmed. Both need a setup-worded recovery
  // email on retry, without deleting or reassigning their identity.
  if (user.email_confirmed_at) {
    await dependencies.recoverLegacy(email);
    return;
  }
  const invited = await dependencies.invite(email);
  if (invited.id !== userId) throw Error('Invitation identity did not match the staff account.');
}
