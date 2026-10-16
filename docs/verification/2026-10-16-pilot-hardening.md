# First-hotel pilot hardening — 2026-10-16

Scope: preserve the staff-only single-hotel workflows and existing configuration. User confirmed that fitting the hotel's own rules comes later. No production mutations, account emails, commits, pushes or deployments were performed.

## Changes and regression evidence

| Risk | Change | Evidence |
| --- | --- | --- |
| Failed reads appeared as empty payments or eligible rooms | Required reads and enrichment reject errors; existing operations error boundary supplies retry | Actual reader modules executed with failed Supabase transports across every required table; failures reject |
| API response limits truncated lists/totals | Operational lists use immutable-ID keyset pages, exact remaining counts and increasing-ID checks; display sorting preserved | 1,203-row helper fixture with lower server cap; 1,201-row payment reader; count-neutral delete/add regression; chronological payment display |
| Dashboard totals fetched individual event/payment rows | 0013 adds an owner-only SECURITY INVOKER aggregate; updated overview consumes it | 1,201 payments/events, void exclusion, Lagos day edges, tenant isolation, inactive/role/anonymous denial |
| Eligibility could change between a check and arrival/move | 0012 serializes room-affecting RPCs; stays first, sorted room locks, then block rows | Original arrival failed lock-contract regression; new protocol reviewed independently; sequential lifecycle and stale updates pass. Real multi-session lock-wait behavior remains unverified |
| Partial write failure could leave inconsistent records | Preserve database transactions and add failure injection | Forced late audit insertion failure leaves stay/payment/activity counts unchanged |
| Clean installation relied on historical knowledge | Ordered, SHA-256-verified manifest; explicit 0004 repair substitution; exclusive-create bundle export | Four tooling tests cover ordering, source drift, duplicate versions, overwrite protection and Windows line endings |
| Recovery was unproven | Synthetic embedded archive restoration and separate production runbook | All 13 fixture tables match after restore; tenant RLS and arrival/duplicate protection work. This is not production recovery proof |

Final application suite: **79 passed, zero failures/skips**, including missing-RPC compatibility and fallback failure propagation. Database replay through 0013, full lifecycle, owner aggregates and embedded recovery passed. Recovery tooling suite: **4 passed**. Manifest: **14 steps verified**.

Typecheck and the final Next production build passed after keyset remediation. Cloudflare/vinext completed all five build stages; sandbox blocked its external Wrangler log path and route classification warnings remained. Neither build establishes deployment health.

Full lint returned zero errors and four existing warnings: three generated Netlify manifests and an unused ActivityCategory import. Changed-source lint passed; two new unused test-parameter warnings were removed. Browser regression passed outside the Windows sandbox after correcting its wait from 15 to 60 seconds: two serial 20-second refreshes, unsaved input, staff confirmations and 390/768/1440 layouts. Actions are mocked and never write live hotel data.

Independent TypeScript/general/database/security reviews ran. The offset-pagination concern and missing deployment-order instructions were fixed; general and database/security reviews found no remaining actionable defects. Pagination uses separate requests and does not claim a shared multi-query snapshot.

## Existing configuration and release order

Read-only live checks confirmed one hotel, 40 active rooms, three categories, no missing/nonpositive category rates, four active staff and no pending setups. Roles: one Owner, one Receptionist, two Supervisors. This confirms configured data exists; it does not prove it matches the hotel's rules or physical inventory. Live RPC signatures were inspected; no full production-schema parity audit was performed.

The user subsequently applied migrations **0012 and 0013**. Read-only live verification on 2026-10-16 confirmed all eleven installed function bodies match the local migration bodies after whitespace normalization. The ten operational functions retain SECURITY DEFINER; statistics is STABLE SECURITY INVOKER with an empty search path. Anonymous execution is denied for all eleven; authenticated staff may execute operational RPCs and statistics, whose internal guards enforce roles; the scheduler remains unavailable to authenticated staff. No operational rows were changed by verification.

The live migration ledger still lists only the October 5 staff-management and tenant-guard entries. Installed SQL and ledger history therefore differ. Do not rerun 0012/0013 or alter historical entries automatically; reconcile their ledger mapping separately. Frontend deployment remains pending. The Owner overview uses the installed aggregate and safely falls back to complete checked RLS table reads only on missing RPC during rolling upgrades. Other failures remain explicit. The previous frontend remains compatible with the additive changes.

## Remaining release gates

- Separate-session PostgreSQL collision tests: arrival/arrival, arrival/maintenance, move/maintenance, extension/departure. No PostgreSQL CLI server was installed and Docker's Linux daemon was unavailable here.
- Actual Supabase backup restore into an isolated recovery environment, with recorded recovery time/data-loss window and Auth/service checks.
- Authenticated deployed-role journeys on actual reception/phone devices and networks; measure convergence and recovery from failed connections.
- Hotel acceptance of fallback/reconciliation and pilot operation. Use the existing configuration as requested; defer hotel-specific rule changes until agreed.

Execute and record these using `docs/pilot-readiness.md`. Do not treat local proofs as completion of those external gates.
