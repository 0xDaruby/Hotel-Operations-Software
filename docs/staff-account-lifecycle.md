# Staff access and account deletion

This feature separates reversible access removal from permanent login deletion.

## Staff onboarding

The manager creates a staff profile, then the server sends a Supabase invitation to the new, unconfirmed email identity. Access stays inactive until the recipient opens the invitation, chooses and confirms a 12–72 character password on **Set your password**, and the password update and profile completion succeed. The app then opens the assigned role workspace. No extra onboarding page is required.

Callback handling accepts `invite` links and existing `recovery` setup links. Fragment-based links use the dedicated `/auth/complete` consumer, which removes tokens from browser history before establishing the session. A root-level bridge also handles links that Supabase sends to the application's Site URL, including when the browser already has a different staff session.

Supabase confirms an invitation's email when the link is opened, before the staff member chooses their password. A retry for this confirmed-but-unfinished account (or an older confirmed pending account) therefore uses recovery internally. It must still read as account setup to the recipient. Do not delete/recreate an identity to resend setup.

### Required hosted Auth email configuration

In this hotel's Supabase **Authentication > Email Templates**, apply:

The hosted dashboard currently requires either custom SMTP or a Pro plan to edit template subjects/bodies. This project's custom SMTP switch was inspected and is disabled. Do not claim that repository templates were applied while this restriction remains. New accounts can use Supabase's standard invitation without custom SMTP; confirmed-but-unfinished retries retain the default recovery wording until the template can be configured. Do not enable SMTP until working provider credentials and a verified sender are available, or upgrade the plan without the user's authorization.

- **Invite user** subject: `You're invited to your hotel workspace`; body: `supabase/templates/staff-invite.html`.
- **Reset password** subject: `Complete your staff account setup`; body: `supabase/templates/staff-setup-retry.html`.

The application currently uses recovery emails only for manager-authorized pending staff setup. If a separate forgotten-password feature is added, give recovery emails neutral password-management wording or a dedicated delivery path before enabling it.

In **URL Configuration**, set the production Site URL to `https://hotel-operations-software.netlify.app` and allow `https://hotel-operations-software.netlify.app/auth/confirm?next=/set-password`. Keep `WEB_ORIGIN` on Netlify equal to the production origin. The application fixes the post-verification destination to `/set-password` and does not trust a link's `next` query for navigation.

On 2026-10-26, the hosted dashboard still had Site URL `http://localhost:3000` and only the Netlify `/login` path on its production redirect list. The Site URL was corrected to the production origin and the exact setup callback above was added; Supabase confirmed both saves. Existing local/Cloudflare entries were left unchanged. This fixes redirect configuration, not hosted email wording or end-to-end inbox/session verification.

Repository templates are deployment sources; committing them alone does not update hosted Supabase emails. Verify those settings before claiming the welcome/retry emails are configured. Existing emails retain their original wording; request a new setup email after applying the templates.

- **Deactivate access:** the existing owner-only, same-hotel operation sets access inactive, deletes that staff member's Auth sessions and refresh tokens in the same database transaction, and records the reason. Reactivation also revokes sessions so an older login cannot regain access.
- **Delete account:** available for inactive non-owner staff after password setup is completed or cancelled. The owner supplies a reason and types `DELETE`. A database request locks the account against activation, then the server calls Supabase's official hard-delete Auth API. A service-only completion operation confirms Auth removal and records completion.
- **History:** staff profile UUIDs and names remain as historical references. Stays, payments, inspections, maintenance and activity records are not deleted. The deleted login disappears from the staff directory and cannot be reactivated; a future invitation creates a new identity.

## Failure and session behavior

### Login persistence

Login includes **Remember me**, unchecked by default for shared hotel devices. When selected, Supabase Auth cookies and the non-sensitive preference cookie expire 30 days after their latest Auth write/refresh. Without it (or without a stored preference), Auth writes use browser-session cookies. No email or password is saved by this feature. Browser session-restore settings can preserve session cookies; closing a window is not a guaranteed sign-out. Use **Sign out** when leaving a shared device.

Browser, server-action and proxy refresh paths share the same cookie lifetime rules and preserve explicit cookie deletion. Refresh responses retain the SDK's private/no-store headers, including redirects. Remember me does not bypass the staff profile/session revocation checks described below.

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
