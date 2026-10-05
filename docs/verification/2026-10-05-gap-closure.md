# Gap closure verification — 2026-10-05

Workspace: Hotel Operations. Assessment uses current source and live Supabase evidence. Following explicit user approval, migrations 0010 and 0011 were applied successfully. No commit, push, or frontend deployment occurred.

## Implemented locally

- Owner-scoped staff directory with email, secure server provisioning, inactive password setup, mail retry, activation/deactivation reasons, and pending cancellation.
- Fixed recovery callback destinations and server-only setup completion after password update. Cancellation prevents stale-link activation.
- Serial four-second server refresh, hidden/offline pause, focus/reconnect recovery, unsaved-input preservation.
- Verified-schema clean bootstrap, scheduler repair, real test command, pinned PostgreSQL test engine, and Next route type regeneration before typecheck.
- Transactional hotel guards for room/category/stay references in stays, payments, inspections, maintenance and activity; scoped readiness and timestamp search-path fix.
- Current PRD, project MEMORY.md, setup and environment contract updated. API/worker/Prisma are documented as unused scaffolds; default development starts only web.

## Evidence

| Check | Result | Meaning |
| --- | --- | --- |
| Locked dependency installation | Passed | Restored missing local links; initial sandbox Windows user-info/access errors were environment failures |
| `pnpm test` | 41 passed, zero failed/skipped | Existing and new unit/provisioning/password/refresh/navigation tests execute |
| `pnpm test:database` | Passed replay through 0011 | Actual PostgreSQL-engine functions/RLS, with Auth and cron metadata shims |
| Database behavior | Passed | Atomic arrival/payment, duplicate occupancy, inactive denial, cross-hotel readiness/arrival/move/maintenance denial, staff directory/provisioning/activation/stale-state/owner safeguards |
| Next production build | Passed | All operational/auth routes compile |
| Cloudflare/vinext build | Passed | Five build stages; route classification warning remains tool output, not deployed proof |
| Web typecheck after vinext | Passed | `next typegen && tsc --noEmit` repairs generated route-type clash without suppression |
| React/security/general reviews | No remaining critical/high source findings | Initial SQL delimiter, callback lint and confirmation-focus findings repaired before release |
| Edge browser component integration | Passed | Repeated refresh, unsaved inputs, focused confirmation, activation/cancellation, 390/768/1440 layouts; actions mocked |
| Live Supabase read-only state | ACTIVE_HEALTHY, RLS on ten tables | Existing database available; four active staff profiles |
| Live pg_cron history | Successful 1–5 October, 07:00 UTC | Daily inspection job actually runs at 08:00 Lagos |
| Existing room ownership mismatch probe | Zero for stays/inspections/maintenance/activity | No discovered pre-existing mismatch in those relationships |
| Live migration history | Two approved entries | staff_management `20261005221751`, operational_tenant_guards `20261005221801`; earlier manually applied schema must not be blindly replayed |

Final checks:

- `pnpm lint`: passed with zero errors and one pre-existing unused ActivityCategory import warning.
- `pnpm typecheck`: passed for web/API/worker, including Next route type regeneration after vinext.
- `pnpm test`: 41 passed, zero failures/skips after legacy-profile reactivation fix.
- `pnpm test:database`: passed, including legacy staff reactivation and cancellation of pending setup; stale links remain denied.
- Actual local Next production server on port 3100: signed-out staff redirect, mobile login layout and invalid setup callback passed in Edge. No authenticated live mutation was performed.

Compatibility: before migration application, auth still loads existing profiles and staff directory falls back only on a missing-RPC response to the original RLS list. New controls remain disabled with an explicit notice. Setup cancellation has its own boolean; the legacy must_change_password flag does not incorrectly prevent established staff reactivation.

## Pending production changes

Initial automatic approval review rejected live application pending explicit authorization. The user subsequently approved both exact migrations; both applied successfully on 2026-10-05. Live verification confirmed six staff functions, five enabled tenant guards, anonymous execution denied for the new functions, authenticated execution denied for setup completion and the trigger function, service-role setup completion permitted, and RLS retained on all ten tables. Four existing profiles remain active, with zero pending/cancelled profiles. Readiness was false for all 40 rooms without authenticated identity.

Database prerequisites are now installed. Local behavioral replay remains the proof for mutating workflows; live verification used read-only checks without changing operational records or staff access.

The ignored local `.env` now contains a server-only admin key, verified against the Auth admin endpoint with HTTP 200. WEB_ORIGIN is localhost:3001; its exact setup callback is installed in the live URL allowlist. The correct checkout was restarted on port 3001, and the user-supplied Owner session successfully loaded the live staff directory and enabled controls. Port 3000 belongs to the separate Hotel Ops checkout and was left untouched. Custom SMTP is disabled, so default delivery is restricted to project-team addresses. A user-controlled recipient was requested for real setup; no real setup email has yet been sent.

## Limits

Embedded tests emulate Auth roles/users and pg_cron metadata, not GoTrue or scheduled execution. Browser component actions are mocks, not database-connected staff operations. Existing-account live workflows are verified below. Actual recipient email/setup, physical-device/network convergence, deployed frontend health, and backup restoration remain unverified. Existing live-role-audit.js was not run because it mutates the live project.

New-account email/password setup remains pending at the user’s explicit request. Ordinary staff recipients require custom SMTP. Existing-account verification is complete as recorded below.

## Existing-account live verification — 2026-10-05

User requested testing existing accounts and leaving new-account email setup pending. Owner in Edge and Supervisor in the in-app browser authenticated separately against the correct localhost:3001 checkout.

- Owner deactivated and restored the existing Role Audit Supervisor account through real server actions and Supabase RPCs; both UI outcomes and database audit records passed.
- With Supervisor activity already open, a second deactivation and restoration generated distinct cross-session A/B reasons. Both appeared automatically without observer navigation/reload. Observations were made approximately 16 and 20 seconds after submitting the owner actions; these are observation bounds, not measured refresh latency or an SLA.
- Supervisor direct navigation to /staff redirected to /inspections; no owner form was accessible.
- Final live state: four staff profiles, four active, zero pending setups. Four attributed verification audit entries remain intentionally as history. No new accounts, emails, guest stays, payments, inspections or maintenance records were created/changed.
- This proves two independent authenticated browser sessions on one PC using the live backend, not separate physical devices or a deployed frontend.
