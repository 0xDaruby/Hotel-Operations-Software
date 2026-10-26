import type { StaffActionResult } from './provisioning';

export type DeletionInput = { userId: string; reason: string; confirmation: string };

export function validateDeletionInput(value: unknown): DeletionInput {
  if (!value || typeof value !== 'object') throw Error('Provide the staff account and deletion confirmation.');
  const row = value as Record<string, unknown>;
  if (typeof row.userId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(row.userId) ||
    typeof row.reason !== 'string' || !row.reason.trim() || row.reason.trim().length > 500 || row.confirmation !== 'DELETE') {
    throw Error('Provide a valid account, a reason, and type DELETE to confirm.');
  }
  return { userId: row.userId, reason: row.reason.trim(), confirmation: row.confirmation };
}

/** Keep authorization/staging before privileged Auth operations; never unstage an uncertain delete. */
export async function deleteStaffAccount(value: unknown, dependencies: {
  prepare: (input: DeletionInput) => Promise<string>;
  authUserExists: (userId: string) => Promise<boolean>;
  deleteAuthUser: (userId: string) => Promise<void>;
  complete: (requestId: string, userId: string) => Promise<void>;
}): Promise<StaffActionResult> {
  let input: DeletionInput;
  try { input = validateDeletionInput(value); }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid deletion details.' }; }
  let requestId: string;
  try { requestId = await dependencies.prepare(input); }
  catch { return { ok: false, error: 'This account cannot be deleted. Refresh and check that it is inactive with setup completed or cancelled.' }; }
  try {
    if (await dependencies.authUserExists(input.userId)) {
      try { await dependencies.deleteAuthUser(input.userId); }
      catch {
        if (await dependencies.authUserExists(input.userId)) {
          return { ok: false, error: 'The account remains inactive. Deletion failed; retry Delete account. Contact the administrator if it keeps failing.' };
        }
      }
    }
    await dependencies.complete(requestId, input.userId);
    return { ok: true, message: 'Staff login permanently deleted. Hotel history retained.' };
  } catch {
    return { ok: false, error: 'Deletion could not be confirmed. The account remains inactive; retry Delete account to finish safely.' };
  }
}
