# First-hotel pilot and recovery runbook

This is an execution checklist, not evidence that the pilot or production restore has passed. Keep dated results, operator names, build revision, environment, expected/actual results and redacted evidence in `docs/verification/`. Never put guest details, passwords, connection strings, tokens or backup data in Git or bug reports.

## Release gates

- [ ] Run the application tests, database replay, migration manifest check, lint, typecheck and both runtime builds listed in `setup.md`. Review failures before releasing.
- [ ] Apply only reviewed, unapplied forward migrations to the intended project. Record project identity and deployed revision privately. The existing manually bootstrapped database must not receive the clean bundle.
- [ ] Complete the separate-session collision tests on disposable PostgreSQL, and authenticated role/device journeys below against a staging deployment. PGlite replay and mocked component tests cannot establish those results.
- [ ] Complete a real backup/restore rehearsal below and record recovery time and data loss window. A successful backup export alone is insufficient.
- [ ] Confirm the hotel configuration and staff fallback procedure with the hotel contact before enabling the pilot.

## Reproducible clean installation and migration evidence

`node scripts/database-plan.mjs --check` verifies the ordered SQL files against `supabase/bootstrap/migration-manifest.json`. The manifest hashes the foundation, every applied migration, and the immutable historical 0004 source, normalizing CRLF to LF for cross-platform Git checkouts; execution substitutes the reviewed scheduler repair. It detects repository drift only; it does not compare the live schema or Supabase migration ledger.

To prepare an installation, run `node scripts/database-plan.mjs --write-bootstrap clean-bootstrap.local.sql`. This exclusively creates a new file and makes no database connection. Review it, then execute it with stop-on-error in a **new disposable Supabase project**. Auth roles/schema and actual pg_cron support must already exist. If any step fails, discard that disposable project and investigate; do not continue a partially applied bootstrap. Never use it to upgrade or repair the first hotel's database.

For a new reviewed migration, inspect its diff and the plan printed by `node scripts/database-plan.mjs`. After review, update the manifest by capturing that exact JSON output, then run `--check` and the database replay. Keep historical migrations immutable. The manifest is a review aid, not a replacement for code review.

Before upgrading the existing project, collect a **read-only** schema export and migration ledger privately. Compare functions, constraints, indexes, grants, RLS policies, triggers and cron definitions against a clean installation using the reviewed plan. Existing ledger entries use timestamp versions, while source files use short numeric versions; reconcile them in a reviewed mapping. Do not automatically mark old migrations applied or blindly run `supabase db push`. Record differences and resolve them through an additive forward migration after checking the affected data.

## Backup and restore rehearsal

1. Name a recovery owner and a hotel decision-maker. Agree a maximum acceptable outage and maximum acceptable loss of recent records; measure both during rehearsal.
2. Obtain a supported backup/export from the actual hosting project and verify completion. Store it privately with restricted access and encryption. Record its timestamp, project and scope separately. Establish whether it includes operational schemas, Auth users, roles/grants, cron definitions and external assets. Do not assume a database backup includes hosting secrets, email configuration or external storage objects.
3. Create an explicitly named **disposable recovery project** isolated from live staff and email delivery. Verify its project identity independently before any restore. Record the target and backup privately; never supply the production project as a restore target.
4. Follow the hosting provider's supported restore procedure into that target. Use compatible PostgreSQL tooling if restoring a dump; require stop-on-error, inspect all errors, and retain redacted logs. Keep target scheduling disabled during validation so restored jobs cannot execute unexpectedly. Do not replay the clean bootstrap over a full restored schema.
5. Compare source-at-backup and restored counts for hotels, profiles, rooms/categories, stays, payment records, inspection requirements/results, maintenance and activity. Verify active stay uniqueness, payment totals/voids, overdue departures and open maintenance. Use private aggregate evidence; do not commit row data. Check RLS/grants/triggers and target cron definitions. Do not mix post-backup live changes into this comparison.
6. With isolated consenting test accounts, verify sign-in, each role's access, and a complete arrival → extension → room move → departure → inspection flow in the restored environment. Verify maintenance blocks and payment/history reconciliation. Confirm account recovery/setup and deployment secrets separately; restoring rows does not prove those services work.
7. Record elapsed restore time, backup age, all discrepancies and corrective work. Keep the pilot gate open until checks pass. Retain evidence and dispose of the recovery environment and copied data according to the hotel's agreed retention policy.

Local tool discovery on 2026-10-16 found no `psql`, `pg_dump` or `pg_restore` on PATH. Docker CLI exists but its Linux engine was unavailable. No live backup, restore or production schema comparison was performed by these helpers. Repository checks remain useful but cannot close this release gate.

## Hotel configuration and staff acceptance

Use consenting test accounts and synthetic guests in staging first. Assign one Receptionist, one Supervisor and the Owner individual accounts; avoid shared logins. Record the actual phone, reception computer, browser and network used.

- [ ] Use the existing rooms, categories, rates and staff configuration for the pilot baseline, as requested. Verify that baseline works through the journeys below; no new hotel or staff provisioning is required for this preparation. Before fitting the software to the actual hotel later, reconcile its inventory/current occupancy and confirm timezone, departure rules, inspection cutoff, payment recording and correction policy. Existing sample/configured values do not establish the hotel's agreement.
- [ ] Configure the production origin, Supabase redirect settings and server-only credentials privately. Verify setup delivery and activation, pending invitation cancellation, deactivation and the role boundaries using consenting recipients.
- [ ] Receptionist: record arrival/payment, extend, move, depart and perform permitted corrections/voids; verify snapshots, money and activity. Attempt supervisor/owner actions and confirm rejection.
- [ ] Supervisor: inspect a departed room, report multiple maintenance issues, resolve only one and confirm the remaining issue still blocks readiness. Confirm forbidden reception/owner actions are rejected.
- [ ] Owner: review totals, history and staff lifecycle. Verify operational permissions against the PRD rather than assuming an owner can perform every staff action.
- [ ] On two signed-in devices, make one change and measure refresh convergence on the other. Verify refresh does not discard an unsaved form, stale submissions require retry, and reconnected devices recover.
- [ ] Exercise separate-session concurrent arrival/arrival, arrival/maintenance, move/maintenance and extension/departure. Verify one valid serialized outcome, clear rejection where needed, and no duplicate payments or partial activity. Record both commit order and resulting room state.
- [ ] Disconnect/reconnect the actual device network, expire a session and simulate a failed query in staging. Staff must see uncertainty/error rather than false empty totals or availability. Confirm failed writes do not invite accidental duplicate action.
- [ ] Test daily inspections with closed browsers and inspect real scheduler success/failure evidence. Local cron metadata shims cannot verify scheduling.
- [ ] Check the critical workflows on the actual narrow phone and reception display with keyboard navigation and visible focus. Browser component mocks do not prove real authentication, database permissions or deployed-runtime behavior.

## Pilot operation, incidents and reconciliation

Begin with a named staff group and a hotel-approved period of parallel operation. Choose a single agreed authoritative record during that period and explain how paper/manual entries are reconciled; never let two uncoordinated systems decide room availability. Train staff on error screens, stale updates, recorded payments and the fallback before the first shift.

At each shift handover compare room occupancy, recorded arrivals/extensions/departures, payment totals/voids, pending inspections and open maintenance with the agreed record. Record discrepancies and their resolution privately. Capture failed actions, incorrect availability, payment discrepancies, observed refresh delay and requests for assistance. Agree review dates and an owner for each issue.

When data is uncertain, stop the affected operation and use the hotel's agreed fallback. For possible duplicate occupancy, incorrect money or unauthorized access, pause affected software use, preserve redacted evidence and contact the named support owner. Reconcile before resuming. Do not resolve incidents by deleting audit rows, rerunning bootstrap or restoring production without a separately reviewed recovery decision.

Bug reports should contain: time/timezone, build revision, role, device/browser, workflow, steps, expected/actual behavior, visible error/reference and business impact. Redact guest/staff personal information. The support owner checks application hosting errors, Supabase errors and cron history at an agreed frequency during the pilot and tests that a synthetic failure can actually be found there; logging infrastructure alone is not evidence that someone will respond.

Before each deployment, record the current working revision and its runtime configuration securely. Rehearse returning to that build on staging. Prefer additive database changes that remain compatible with the previous frontend. Database reversal requires a reviewed forward repair; application rollback alone does not undo changed operational data. At the end of the parallel period, the hotel should approve sole-system use only after reconciliation, recovery and staff acceptance gates pass.
