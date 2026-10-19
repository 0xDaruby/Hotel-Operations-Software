# Hotel Operations UI review

Reviewed: 19 October 2026. Scope: local Next.js staff application.

## Design judgment

The existing sage navigation, warm paper surfaces, brown actions, serif headings and room-first information hierarchy are appropriate for this hotel operations tool. Keep that identity. Its distinction comes from clear room facts and practical staff tasks; it does not need decorative illustrations, promotional panels, gradients or a replacement component library.

This review applied `mobbin-ui-decisions`, the frontend design guidance, React patterns and React testing guidance, alongside the repository's `design.md`. Mobbin-informed component distinctions guided the decisions; this is not an official Mobbin certification or a claim of usability-study results.

## Implemented decisions

| Area | Decision and reason |
| --- | --- |
| Room category and arrival room | Native selects replace the custom animated listbox. These fields choose one existing value. Native selection supplies keyboard operation and a familiar device picker without maintaining a custom listbox interaction model. Room eligibility rules remain authoritative. |
| Room filters | Keep independently selectable state chips, category selection and room search. On phones, category and search share a row, followed by state filters, with DOM and visual order aligned. This exposes the room records sooner. Announce the result count instead of the entire room grid. |
| Room status | Unoccupied uses a neutral badge; ready remains sage. Occupancy, inspection and maintenance remain separate facts. Unoccupied alone must not visually promise readiness. |
| Stays | Add a real in-page Record arrival link when the layout stacks. Reception can reach the existing form without scrolling through every stay. Preserve the form and its workflow. Guest names wrap instead of disappearing behind ellipses. |
| Owner attention | Show every attention item on mobile. Remove the misleading View all link that went to only the first item's queue. The previous three-item CSS limit hid mixed operational work. |
| Owner occupancy | Use a meter for the measured occupancy value, rather than task-progress semantics. Allow room-map cells enough width for readable statuses and wrapping. |
| Payments | Retain a semantic comparison table with column headers and a caption. Put horizontal scrolling in a named, keyboard-focusable region. Use a native GET date form and a real Back to today link; the date field resets to the displayed date on navigation. Use a readable month-name date in the summary. |
| Typography and feedback | Raise 9–11px supporting text to 12px, preserve larger primary type, and provide focus rings for selects, textareas and the table region. Use 16px mobile field text. Distinguish disabled controls from pending operations. Darken destructive actions using the existing danger token. |
| Activity | Replace the heavy brown line on every event with a quiet divider. Keep chronological rows and expandable event details. |
| Account setup | Let a single login panel span the desktop grid, so password setup and link-completion screens are centred rather than confined to one half. |

## Page coverage

| Page | Evidence in this review |
| --- | --- |
| Sign in | Browser screenshot and source review; existing labelled fields and password reveal retained. |
| Room board | Browser inspection at 1440, 768 and 390px. Category filtering, combined occupancy filtering, typed search, no-results feedback and Clear filters exercised. |
| Guest stays | Receptionist desktop and compact-screen inspection; source review of arrival form and correction/departure surfaces. |
| Departure due | Receptionist desktop inspection of live grouped stays and confirmation entry points. |
| Overview | Owner desktop inspection of metrics, room map, attention empty state and recent activity; source review of attention visibility and mobile category disclosures. |
| Inspections | Owner phone inspection of read-only empty state; source review of supervisor outcome, verification, findings and discard flows. |
| Maintenance | Owner phone inspection of empty state and report form, plus source review of report and resolution surfaces. |
| Payments | Owner desktop and 390px inspection with real records. Native date submission to an empty day and Back to today exercised. |
| Activity log | Owner tablet inspection of filters, event rows and native details disclosures; phone navigation inspected. |
| Staff | Owner phone/tablet inspection of form and staff records. Opened a deactivation confirmation, verified native modality and focus, dismissed with Escape, and verified focus returned to the trigger. No confirmation submitted. |
| Password setup / email completion | Source review only; no account credentials changed. |
| Loading / error / success feedback | Source review of existing components; no live network failure or operational save induced. |

## Verification

- Web tests: 104 passed, zero failed.
- Web typecheck: passed.
- Final production build: passed, including TypeScript and generation of all 16 pages.
- Standard web lint: zero errors; three warnings in existing generated `.netlify` manifest files.
- Source-only ESLint: passed without warnings.
- React code review: no blocking findings. The final native payment form and server-component boundary were reviewed separately.
- Room board: no page-level horizontal overflow at 1440, 768 or 390px. The phone viewport was also checked at a short 650px height. The compact toolbar keeps the first room's identity and status visible in that short viewport.
- Payment table at 390px: 620px table inside an approximately 342px scroll region; the page itself did not overflow. Keyboard focus reached the scroll region with a visible outline.
- Date recovery: selecting 18 October opened the corresponding empty day; Back to today restored 19 October in both the summary and date input.
- Staff dialog: focus entered the modal, Escape closed it, and focus returned to the invoking Deactivate access button.
- No operational records, staff permissions or passwords were changed during browser verification.

Local screenshot evidence: [Room board, phone](./2026-10-19-rooms-mobile.png) and [Room board, desktop](./2026-10-19-rooms-desktop.png). Screenshot files are intentionally ignored by Git under the existing image-export policy.

## Follow-up isolated validation

The original live-browser review above encountered empty queues. The follow-up now exercises these states using a disposable in-memory PGlite database with the actual SQL migrations, policies and operational functions. It seeds 18 rooms, 10 inspections and seven maintenance issues, including overlapping blocks. No live hotel records, credentials or external services are used.

The fixture imports the production React components, CSS and inspection/maintenance/arrival action adapters. Only Next navigation/revalidation and Supabase transport are replaced by loopback adapters. Two browser sessions operate against the same disposable database with transaction-local synthetic staff identities.

**Results: all 11 scenario groups passed.**

| Scenario | Observed result |
| --- | --- |
| Populated inspection and maintenance work | Required findings and personal verification enforced; successful saves update the queues. Inspection approval preserves separate maintenance blocks. |
| Keyboard and unsaved changes | Native modal focus/inertness checked; dirty Escape dismissal offers Keep editing and preserves the draft. Browser chrome remains reachable through normal keyboard traversal. |
| Offline save and reconnect | Failed saves preserve entered data, do not show false success, and do not create database records. Reconnection refreshes the fixture while preserving the draft. |
| Pending saves | Duplicate submit/dismissal blocked during inspection saves. Arrival and report fields are frozen until completion, preventing newer edits being erased by the earlier save. |
| Two supervisor sessions | A stale inspection submission is rejected without a second mutation; draft retained, latest version available on reopen. |
| Maintenance already resolved | A second session sees who resolved the issue; it cannot record a second resolution. Other issues in that room remain open. |
| Response lost after commit | A real fixture arrival commits before its HTTP response is dropped. The draft remains visible; retry cannot create another stay, payment or activity event. |
| Long mixed queues | All remaining inspection and maintenance attention items remain visible on mobile; expanded room facts remain accessible. |
| Responsive layouts | Populated overview, room board, inspections, maintenance, payments and arrival forms checked at 390, 768 and 1440px; no page-level horizontal overflow. |
| Magnified content | 200% CSS content scaling passes on populated overview, rooms, inspections, maintenance and payments; the resolution save action remains reachable. This is distinct from browser-chrome zoom. |
| Rendered contrast | Eight page/dialog states checked: 675 text samples and 13 control/focus samples, zero failures within the helper's documented scope. |

The validation caught and fixed editable pending forms, low-contrast input borders/on-sage labels/placeholders, crowded room grids under magnification, and findings counters becoming part of the input's accessible name. A shared control-border token, stable field labels, disabled native fieldsets and workspace-aware form layout address those findings.

Web tests: 104 passed. Full database replay, lifecycle/role checks and embedded recovery checks passed. Source ESLint and production build also passed. React and fixture reviews reported no remaining findings.

Reproduce with `pnpm test:ui`; see [runtime requirements and fixture boundaries](../../tests/browser/UI-VALIDATION.md). The tested runtime is Playwright 1.62.1 with installed Windows Edge; the documentation explains the optional module-path setup. [Saved machine-readable results](./2026-10-19-ui-validation-results.json) distinguish the checks and limits. Detailed screenshots and raw measurements remain locally saved under `tests/browser/artifacts/ui-validation/` and are ignored by Git.

## Remaining evidence boundaries

The local validation work is complete. Physical phone/software-keyboard checks, actual browser-chrome zoom, Safari and a comprehensive accessibility assessment still require their own device/browser evidence. The contrast helper covers solid-colour text, input values/placeholders, input boundaries and observed focus states; it does not certify every icon, opacity layer, native popup or assistive technology.

Stale versions and real database functions are exercised locally. Independent production PostgreSQL connection locking, Supabase/Next transport, live outage behaviour and production backup restoration are not established by the embedded fixture. Scheduler metadata is shimmed; real scheduled execution remains a separate operational check.

Changes and evidence are saved locally. Nothing has been pushed or deployed by this review.
