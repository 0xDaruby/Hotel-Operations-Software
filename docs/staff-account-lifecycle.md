# Staff access and account deletion

This feature separates reversible access removal from permanent login deletion.

- **Deactivate access:** the existing owner-only, same-hotel operation sets access inactive, deletes that staff member's Auth sessions and refresh tokens in the same database transaction, and records the reason. Reactivation also revokes sessions so an older login cannot regain access.
- **Delete account:** available for inactive non-owner staff after password setup is completed or cancelled. The owner supplies a reason and types `DELETE`. A database request locks the account against activation, then the server calls Supabase's official hard-delete Auth API. A service-only completion operation confirms Auth removal and records completion.
- **History:** staff profile UUIDs and names remain as historical references. Stays, payments, inspections, maintenance and activity records are not deleted. The deleted login disappears from the staff directory and cannot be reactivated; a future invitation creates a new identity.

## Failure and session behavior

Auth deletion and database confirmation are separate services. If either fails or the response is lost, the account stays inactive with **Deletion pending** and **Retry delete account**. Retry reuses the original request and verifies whether Auth removal already happened. It does not undo a partially completed deletion or report unconfirmed success.

An active workspace checks access on the existing 20-second refresh schedule and on focus/reconnection. A denied session clears local Auth state and returns to login. Network failures retry without treating the outage as revocation. Offline devices cannot be remotely cleared while disconnected; database access is denied independently of browser cleanup.

For previously revoked profiles, authorization also checks the JWT session ID against a surviving, newer Auth session. This prevents old unexpired access tokens from becoming useful again after reactivation. Initial invitation/password setup is deliberately exempt from reactivation revocation so its existing completion flow continues to work.

## Deployment order and verification

1. Review and apply only `supabase/migrations/0014_staff_account_lifecycle.sql` to the existing hotel project. Do not replay the clean-project foundation or old migrations.
   The migration adds restrictive session/tenant guards without altering existing read policies or depending on their names. Existing permissions must still grant access; additional permissive policies cannot bypass the guards.
2. Verify the migration ledger and security-definer permissions, then deploy the matching web changes. The new deletion control is hidden when the directory RPC lacks lifecycle support; access changes refuse to claim session revocation if the new status RPC is unavailable.
3. With dedicated test accounts, verify real Supabase sign-in on two devices, deactivation, failed refresh, browser cleanup, reactivation requiring fresh sign-in, and deletion followed by directory/history inspection. Never use real staff for destructive acceptance tests.

Migration 0014 depends on Supabase-managed Auth tables (`auth.sessions` and `auth.refresh_tokens`). Their relevant column types were inspected read-only in the connected project during implementation. This does not prove real GoTrue refresh behavior or concurrency. Keep managed Auth compatibility and a real refresh test as release checks.

The migration changes no existing staff rows. Reversal requires a reviewed forward migration; removing the session fence weakens revocation. Permanent Auth deletion has no account-level undo.

## Local verification

- Web tests include deletion authorization order, exact confirmation, API failure, lost response, retries and session-check network errors.
- PostgreSQL replay covers tenant/owner/self/active guards, atomic session cleanup and rollback, old-token fences, initial setup, permissions, idempotent completion and historical foreign keys.
- `node tests/database/replay.mjs --legacy-profile-policy` repeats the database checks using the existing hotel's profile policy name.
- `node tests/database/replay.mjs --renamed-read-policies` repeats the checks after renaming every existing read policy, proving the migration does not depend on their names.
- Browser fixtures use production staff controls with isolated action boundaries; they do not delete live Auth users.
