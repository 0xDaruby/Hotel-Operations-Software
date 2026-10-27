# Password recovery and security patch

## Decisions

Recovery is separate from first-time staff setup. Every active staff role, including Owner / Manager, can request a reset from login. A reset never changes role, hotel membership, account activation, setup flags or operational history. Canceled, inactive, deleting and deleted accounts cannot claim recovery access.

The council considered 15-minute and one-hour email links. It chose the existing **one-hour** email expiry because Supabase shares this setting with invitations, with a separate **15-minute** completion window measured from creation of the verified email session. The hosted Email OTP expiration was inspected as `3600` seconds. Supabase validates and consumes email links; refreshing a token does not extend the application's 15-minute window.

## Authorization and failure handling

The reset page requires a fresh, server-verified Auth identity and database proof: a matching surviving Auth session, a fresh `otp`/`recovery` entry in `auth.mfa_amr_claims`, and a recent `auth.users.recovery_sent_at` preceding that session. The proof is recent email ownership tied to a reset request; implicit Supabase verification uses the broader `otp` method. A URL's `type`, a normal password session, a client role or editable user metadata is never sufficient.

Migration `0015_password_recovery.sql` adds an inaccessible private one-use ledger and narrowly granted functions. The claim locks the caller's staff profile, rechecks eligibility, consumes that session once, advances its session fence and revokes other Auth sessions/refresh tokens. The current recovery Auth session survives only long enough for the normal user-authenticated Supabase password update; the new fence already denies its operational database access. A service-only finalizer then revokes all sessions and records a confirmed or unconfirmed outcome. Users must sign in again.

If the provider rejects the password or its response is lost, cleanup still runs and no success is reported. A failed/unconfirmed outcome does **not** prove that the password remained unchanged: the provider may have committed before a network failure. Request a new link or try the new password. An interrupted unfinished claim prevents overlapping reset writes for up to 15 minutes; an ordinary anonymous requester cannot claim or permanently lock an account.

This is not a distributed transaction with Supabase Auth. The fence is committed before the password change so old operational tokens fail closed even if a later network operation fails. The private ledger holds no password or email token. Auth schema column types used by the migration were inspected read-only in the managed project; managed Auth behavior still needs a real-recipient test.

## Abuse controls

Login and reset-email requests go directly from the browser to Supabase Auth, preserving the end-user IP for provider rate limiting. There is no application-side password hashing service or per-instance in-memory limiter. The browser reset button's one-minute cooldown is convenience, not the security boundary.

Live settings inspected/updated on 2026-10-27:

- Token endpoint: reduced from 150 to **60 requests per five minutes per IP**. Supabase documents this bucket as covering password, refresh, ID-token and PKCE grants. Token-bucket bursts are possible; this is not a permanent account lockout. Because a hotel may share an IP, monitor legitimate throttling before reducing it further.
- Sign-in/sign-up and verification buckets: **30 per five minutes per IP**, retained.
- Public signups, anonymous sign-ins and manual identity linking: already disabled, retained.
- Email confirmation and secure email changes: already enabled, retained.
- Secure password change: enabled. New-password minimum submitted as **12 characters**, matching the app; no new character-class requirement.
- Email link expiration: **3600 seconds**, retained.

The app validates bounded email/password input and handles provider HTTP 429 without automatically retrying a bad password. Email requests show the same account-neutral confirmation for known, unknown, blocked or email-throttled addresses. Provider/network outages get a generic failure. Error bodies never expose provider internals, passwords or recovery credentials.

Rate limits reduce sustained single-IP abuse; they do not guarantee protection from distributed attacks or stolen inboxes. CAPTCHA is not enabled: it requires a real provider key and frontend integration, and enabling it without those would break login. Leaked-password protection is unavailable on this project's Free plan. No paid plan or external account was created. The default Supabase mail service has documented delivery restrictions/low quotas, so reliable production recovery still needs a configured sending provider.

## Focused application patches

- Post-login destinations are restricted to known internal routes; external, backslash and control-character variants are rejected.
- Stay, inspection and maintenance actions validate unknown runtime input before trimming or making RPC calls. UUIDs, finite amounts, versions, paid days and text sizes are bounded. SQL-like names remain parameter data, not executable SQL. Existing PostgreSQL business/tenant/session checks remain authoritative; application text caps are not claimed as universal direct-RPC payload limits.
- Added `nosniff`, frame denial, no-referrer, limited device permissions and structural CSP directives. The CSP does not yet provide nonce-based script restrictions; no full XSS protection claim is made.
- Password fields reuse the existing accessible show/hide controls and 12–72 character setup validation. First-time invites and confirmed-but-unfinished setup retries still route to setup; recovery never calls the setup activation function.

## Verification and release boundary

Migration `0015` was installed in the hosted project on 2026-10-27. Read-only checks confirmed all three public recovery functions exist, anonymous callers cannot claim recovery, authenticated callers cannot finalize it, and the service role can finalize it. No real account password was changed during installation.

The dependency audit also identified framework and transitive package advisories. The patch pins Next.js / eslint-config-next to `16.4.1`, Zod to `4.6.6`, and Vite to `8.3.3`, with version-scoped transitive overrides. Other direct dependency versions were retained. The final production dependency audit reported zero known advisories. After installation, all 138 web tests, TypeScript, focused lint, the production build, and both isolated onboarding/recovery and remembered-login browser suites passed. The build used one worker to accommodate local memory limits. The migration manifest also passed; the earlier canonical PostgreSQL replay included `0015` and passed.

The frontend patch remains local and unpushed. Hosted settings and the additive recovery migration are installed; these backend checks do not establish frontend deployment or real inbox delivery. Registry DNS/timeouts delayed installation, but the final installation and post-update checks completed after connectivity recovered.

Run web tests, typecheck, focused lint, production build, migration-plan verification, PostgreSQL replay and the isolated browser suites. Tests cover malformed inputs, account-neutral requests, provider throttling, claim/update/cleanup ordering, replay/expiry/missing-proof rejection, all roles, cross-user denial, rollback, old-token fences and retained history. Browser fixtures verify the real UI components and SDK cookie behavior against controlled boundaries, not actual inbox delivery.

Apply **only** migration `0015_password_recovery.sql` after review; do not replay bootstrap/old migrations against production. The migration is additive and backfills no account rows. Deploy the web patch after its functions are verified. Recovery fails closed if the new RPC is unavailable.

The user will perform the final real-email/password test. Confirm owner/reception/supervisor reset, reused/expired links, deactivated-account refusal, old-device loss of access, fresh login, and an unchanged onboarding flow before declaring live end-to-end verification complete.

References: [Supabase password recovery](https://supabase.com/docs/guides/auth/passwords), [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [session revocation](https://supabase.com/docs/guides/auth/sessions), [shared email-link expiry](https://supabase.com/docs/guides/auth/auth-email-passwordless), [password protections](https://supabase.com/docs/guides/auth/password-security).
