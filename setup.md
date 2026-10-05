# Hotel Operations Engineering Setup

## Current setup — 2026-10-05

This section replaces the historical setup proposal below. The actual runtime is Next.js/React in `apps/web`, Supabase Auth, server actions, PostgreSQL RPCs/RLS, and database pg_cron. NestJS API/worker, domain/contracts, and Prisma remain unused scaffolds; do not duplicate SQL business rules just to populate them.

### Run on Windows CMD

Use Node 24.15+ and the package manager specified in `package.json`:

```cmd
cd /d "C:\Users\David\Documents\Hotel Operations"
pnpm install --frozen-lockfile
pnpm dev
```

Only copy `.env.example` to `.env` if the latter does not already exist. Configure it privately. Next loads the root `.env`; required web values are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Staff provisioning and password completion also require **server-only** `SUPABASE_SERVICE_ROLE_KEY` and `WEB_ORIGIN`. The latter must be the trusted application origin without paths, query strings or credentials. HTTP is allowed only for localhost/127.0.0.1. Never expose admin credentials under a NEXT_PUBLIC_ variable or commit them. The local key is now configured and verified by a read-only Auth admin request (HTTP 200). Restart the local server to load changed environment values.

`pnpm dev` starts web only. `pnpm dev:scaffolds` retains the optional old API/worker development command.

### Existing live database: upgrade boundary

The live database was originally built through Dashboard SQL, and its migration-history query returned no entries. **Do not replay bootstrap or migrations 0001–0009 on it.** Already-existing tables would conflict.

Prepared and reviewed changes:

1. `supabase/migrations/0010_staff_management.sql`: pending setup column, owner directory/provisioning/activation/cancellation, service-only setup completion.
2. `supabase/migrations/0011_operational_tenant_guards.sql`: active-user/hotel-scoped readiness, room/category/stay consistency guards on five operational tables, fixed timestamp trigger search path.

**Both were applied live on 2026-10-05 after explicit user approval.** Recorded versions are `20261005221751` and `20261005221801`; live function grants, five enabled tenant guards and RLS were verified. Server-only configuration and authenticated end-to-end verification remain required before releasing account setup. Earlier manually applied changes remain unrecorded; do not use `db push` or bootstrap blindly against the live database.

The changes are additive. Frontend rollback to the previous build is compatible; database rollback requires a reviewed forward migration and must preserve audit records. Restoring prior tenant/permission behavior would weaken safeguards.

### New disposable database

1. Run `supabase/bootstrap/foundation.sql` on a clean Supabase project only. It captures verified tables, enums, indexes, private helpers and RLS without users/property seed data.
2. Apply historical 0001–0003.
3. Run `supabase/bootstrap/repair-scheduler.sql` **instead of 0004**, whose original dollar quoting is malformed. Historical files remain immutable.
4. Apply 0005–0011 in order.
5. Create the initial Owner, property, and inventory through a privileged administrative session. There is no default password or production seed.

The foundation deliberately fails when tables already exist. Local test replay uses PGlite/PostgreSQL with explicit Supabase Auth and cron metadata shims; actual Auth/pg_cron need live verification. Read-only live cron history confirmed successful daily checks at 07:00 UTC / **08:00 Africa/Lagos** on 1–5 October.

### Staff setup and delivery

An Owner creates an individual Receptionist/Supervisor Auth account with an undisclosed random initial password and an inactive pending profile. The database derives the hotel from the authenticated Owner. Only after profile creation succeeds is setup email requested. Failed mail leaves inactive access and a retry action; duplicate emails are never reassigned.

Recovery callbacks support default token fragments and token-hash SSR templates. `/auth/complete` consumes and immediately removes fragments; `/auth/confirm` validates recovery token hashes or PKCE codes. Both use a fixed `/set-password` destination. That page verifies the signed-in user and own pending profile; password update precedes the service-only completion RPC.

Configure Supabase Site URL and allowed redirect URLs for the actual origin and `/auth/confirm?next=/set-password`. Verify mail delivery with a consenting test recipient before rollout. No real staff emails were sent in automated verification.

Owners can cancel pending setup with a reason; old links cannot activate cancelled access. Established staff activation/deactivation requires a reason and expected current state. Owner accounts are protected. General password reset for established accounts is outside this implementation.

### Tests and builds

```cmd
pnpm test
pnpm test:database
pnpm lint
pnpm typecheck
pnpm --dir apps/web build
pnpm --dir apps/web build:vinext
```

Web tests are now discovered/run by a real test script. Database replay uses pinned `@electric-sql/pglite` and explicitly labels cron limitations. Next route types are regenerated before typecheck because vinext also writes generated metadata.

`node tests/browser/smoke.cjs` runs Edge component integration when Playwright is available; set `PLAYWRIGHT_MODULE_PATH` to the runtime package directory if needed. Optional `BASE_URL` checks an already-running local production server's signed-out redirect and invalid setup callback. Component actions are mocked; tests never send mail or write live rows. They cover repeated refresh, unsaved forms, confirmations and 390/768/1440 pixel layouts.

### Cloudflare and verification limits

`apps/web/wrangler.jsonc` and vinext scripts build the worker; build success is not deployment proof. Before release, configure its server-only admin key, trusted WEB_ORIGIN and public Supabase values, then test auth/setup in that runtime. No deployed URL/health, backup restoration, real email setup, or authenticated device-to-device convergence was verified in this pass.

See `docs/verification/2026-10-05-gap-closure.md` for exact results and remaining configuration/verification. The older proposal below is retained only as historical architectural context.

## Historical setup proposal — superseded

Status: Proposed implementation baseline  
Updated: 2026-09-19

## 1. What exists now

This workspace currently contains a verified standalone HTML prototype, its readable source files, browser checks, screenshots, and product memory. It does not yet contain a production application, package manifest, database, authentication service, API, worker, or deployment configuration.

Use these files as the current starting point:

| File | Purpose |
| --- | --- |
| `MEMORY.md` | Confirmed decisions, proposals, and open questions |
| `prd.md` | Product authority and acceptance scenarios |
| `design.md` | Visual and interaction direction |
| `operations-shell.html` | Prototype markup and design tokens |
| `operations-app.js` | Prototype data and interaction logic |
| `03-hotel-operations.html` | Self-contained generated prototype |
| `PROTOTYPE.md` | Prototype usage and limitations |
| `verify-prototype.cjs` | Current browser workflow and responsive checks |

Do not treat browser-local sample data or prototype permissions as production truth.

## 2. Run the current prototype

### Directly

Open `03-hotel-operations.html` in a browser. This is sufficient for a single-tab review.

### With same-browser tab synchronization

From PowerShell in this directory:

```powershell
node .\preview-server.cjs
```

Open `http://127.0.0.1:4173` in one or more tabs. This demonstrates same-origin synchronization and stale-write handling only. It is not cross-device synchronization.

Stop the server with `Ctrl+C`.

### Rebuild the standalone prototype

After editing `operations-shell.html` or `operations-app.js`:

```powershell
node .\build-prototype.cjs
```

This regenerates `03-hotel-operations.html`. Do not hand-edit the generated file and source files independently.

### Run the existing prototype verification

The current verification script uses a workstation-specific Playwright dependency path and Microsoft Edge path. With those dependencies available:

```powershell
node .\preview-server.cjs
```

In a second PowerShell window:

```powershell
node .\verify-prototype.cjs
```

The check rewrites `prototype-verification.json` and screenshot artifacts. It is a prototype check, not the production test suite.

## 3. Proposed production architecture

The architecture below is a recommendation for this product and has not yet been scaffolded.

```text
Staff browser
    |
    v
Next.js web application
    |
    v
NestJS REST API + server-sent events
    |
    +--> PostgreSQL through Prisma
    |
    +--> Durable worker for inspection cutoffs and retries
```

### Components

- **Web:** Next.js with TypeScript for responsive staff interfaces.
- **API:** Modular NestJS application with REST endpoints and OpenAPI documentation.
- **Database:** PostgreSQL as the authoritative operational store.
- **Data access:** Prisma migrations and generated client.
- **Authentication:** Better Auth or another approved server-backed staff authentication solution. The final choice remains an engineering decision.
- **Live updates:** Server-sent events for room and queue changes, with ordinary refetch as the recovery path.
- **Worker:** A separate durable process that marks daily inspections due and performs retryable scheduled work. The browser must not be the scheduler.
- **Tests:** Unit tests for domain rules, API integration tests against real PostgreSQL, and Playwright end-to-end tests.

Why separate API and worker processes: the system needs authoritative transactions, role enforcement, append-only history, collision handling, and scheduled work that continues while staff browsers are closed.

## 4. Proposed repository layout

```text
hotel-operations/
  apps/
    web/                  Next.js staff application
    api/                  NestJS HTTP API
    worker/               scheduled and retryable jobs
  packages/
    contracts/            shared API schemas and generated types
    domain/               pure business rules and state transitions
    ui/                   shared UI primitives and design tokens
    config/               shared TypeScript, lint, and test config
  prisma/
    schema.prisma
    migrations/
    seed.ts
  docs/
    decisions/            architecture decision records
  prototype/              preserved prototype sources and artifacts
  .env.example
  compose.yaml
  package.json
  pnpm-workspace.yaml
  prd.md
  setup.md
  design.md
  MEMORY.md
```

Preserve the prototype when scaffolding. Move it only in a dedicated change that fixes all documentation and script paths at the same time.

## 5. Prerequisites

The current workstation check found Node `v24.19.0`, npm `12.0.2`, and pnpm `12.4.2`. Docker was not detected by that check.

For the proposed production workspace, install or confirm:

- Git;
- an active Node.js LTS release supported by the selected frameworks;
- pnpm managed through Corepack or a documented pinned toolchain;
- Docker Desktop with Compose for local PostgreSQL; and
- Microsoft Edge, Chrome, or another Playwright-supported browser for end-to-end checks.

Before scaffolding, re-check framework support for the chosen Node release. Pin Node and pnpm in the repository so every developer and CI uses the same versions.

Useful checks in PowerShell:

```powershell
node --version
npm --version
pnpm --version
git --version
docker --version
docker compose version
```

## 6. Bootstrap plan

These are planned commands for the future production scaffold. Run them only when implementation begins and after creating a Git repository or choosing the destination repository.

### 6.1 Create the workspace files

Create a root `package.json` marked private, a `pnpm-workspace.yaml`, and the `apps` and `packages` folders. Pin the package manager in `package.json`.

### 6.2 Scaffold the web app

```powershell
pnpm dlx create-next-app@latest apps/web --ts --eslint --app --src-dir --use-pnpm --import-alias "@/*"
```

Keep the application staff-only. Do not scaffold guest routes from the legacy prototype.

### 6.3 Scaffold API and worker

```powershell
pnpm dlx @nestjs/cli@latest new apps/api --package-manager pnpm --strict
pnpm dlx @nestjs/cli@latest new apps/worker --package-manager pnpm --strict
```

Normalize the generated files into the monorepo's shared lint, formatting, and TypeScript configuration before feature work.

### 6.4 Add the database layer

Add PostgreSQL and Prisma only after the root workspace is valid. Keep migrations in source control and run integration tests against PostgreSQL, not an in-memory substitute.

### 6.5 Preserve traceability

Before implementing a feature, link it to one or more PRD requirement IDs. If the behavior depends on an open decision, resolve that decision and update `MEMORY.md` and `prd.md` first.

## 7. Local services

A future `compose.yaml` should run PostgreSQL for local development. Do not put application secrets in the Compose file.

Recommended service names:

- `postgres` for the database;
- `api` only if containerized local API work becomes useful; and
- `worker` only after scheduled jobs exist.

The web, API, and worker may run directly through pnpm during normal development while PostgreSQL runs in Docker.

## 8. Environment contract

Commit `.env.example` with names and safe placeholders only. Keep real `.env` files ignored.

Proposed variables:

```dotenv
NODE_ENV=development
WEB_ORIGIN=http://localhost:3000
API_ORIGIN=http://localhost:3001
DATABASE_URL=postgresql://hotel:hotel@localhost:5432/hotel_operations
AUTH_SECRET=replace-with-a-generated-local-secret
HOTEL_TIME_ZONE=
DAILY_INSPECTION_LOCAL_TIME=
```

`HOTEL_TIME_ZONE` and `DAILY_INSPECTION_LOCAL_TIME` must remain unset or clearly marked as demo values until the open product decisions are approved. Never commit a real auth secret, production database URL, personal access token, or third-party credential.

## 9. Development commands

The future root workspace should expose a small consistent command set:

```powershell
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm db:migrate
pnpm db:seed
```

`pnpm dev` should start web, API, and worker together with readable prefixed logs. `pnpm build` must build every deployable package. CI should use the same commands.

## 10. Domain implementation rules

Keep state transitions in the domain or application layer rather than UI components.

### 10.1 Derived room eligibility

Implement occupancy, inspection condition, and maintenance issues as separate facts. Compute whether a room is eligible for arrival. Never let a timer, UI toggle, maintenance resolution, void, or departure directly declare a room ready.

### 10.2 Transactions

Use one database transaction for each consequential operation:

- arrival plus initial payment plus activity event;
- paid extension plus revised deadline plus activity event;
- confirmed departure plus inspection requirement plus activity event;
- room move plus old-room inspection requirement plus activity event;
- correction or void plus derived totals plus activity event;
- inspection result plus requirement version update plus activity event; and
- maintenance resolution plus activity event.

### 10.3 Concurrency

Use database constraints and optimistic versions together:

- enforce one active stay per room;
- reject updates to an outdated stay version;
- reject a stale inspection version;
- prevent duplicate scheduled inspection requirements with an idempotency key; and
- re-check room eligibility inside the arrival transaction.

### 10.4 Time and money

- Store timestamps in UTC and render them in the approved hotel time zone.
- Store the time zone as an IANA identifier.
- Use an exact decimal type or integer minor units for money.
- Store the original stay rate on the stay so later category-price changes do not rewrite active-stay history.
- Append extension payments rather than replacing the original payment.

### 10.5 Audit history

Write structured activity events in the same transaction as the business change. Capture actor, action, entity references, time, reason when required, and safe before-and-after fields. Do not place passwords, auth tokens, or unnecessary guest personal data in audit payloads.

## 11. Suggested module boundaries

### API modules

- `auth`
- `staff`
- `rooms`
- `room-categories`
- `stays`
- `payments`
- `inspections`
- `maintenance`
- `activity`
- `operations-stream`
- `health`

### Worker jobs

- create due daily inspection requirements;
- retry safe scheduled work;
- expire sessions or invitations if the chosen auth flow needs it; and
- perform integrity checks or notifications only after those features are approved.

Scheduled jobs must be idempotent. Re-running the same hotel and cutoff must not create duplicate inspection requirements.

## 12. API conventions

- Use versioned REST routes such as `/api/v1`.
- Validate request bodies at the API boundary.
- Return stable machine-readable error codes plus plain-language messages.
- Use `409 Conflict` for stale versions and room-eligibility collisions.
- Use cursor pagination for activity history.
- Generate OpenAPI documentation from the application contract.
- Do not expose database models directly as public API shapes.

## 13. Testing strategy

### 13.1 Domain tests

Cover pure rules such as 24-hour deadlines, extension pricing, readiness derivation, payment aggregation, room-move effects, and maintenance isolation.

### 13.2 PostgreSQL integration tests

Prove transactions and constraints with the same database engine used in production. At minimum, cover:

- concurrent arrival into one room;
- stale stay update;
- stale inspection submission;
- duplicate scheduled job execution;
- extension payment attribution;
- correction and void audit records; and
- resolution of one issue while another remains open.

### 13.3 End-to-end tests

Translate the PRD acceptance scenarios into Playwright journeys for every permitted role. Include 1440, 768, and 390 pixel widths, keyboard operation, dialog focus restoration, and reduced-motion behavior.

### 13.4 Accessibility checks

Combine automated checks with keyboard and screen-reader smoke testing. Automated tooling alone does not validate understandable status, focus order, or workflow clarity.

## 14. Definition of done

A production feature is complete only when:

1. its governing PRD decision is confirmed or intentionally labeled experimental;
2. backend authorization is implemented;
3. business transitions and activity history commit atomically;
4. unit and integration coverage includes failure and collision paths;
5. the end-to-end role journey passes at supported widths;
6. keyboard and visible-focus checks pass;
7. no unrelated prototype behavior is silently imported; and
8. relevant documentation and `MEMORY.md` are updated.

## 15. Production readiness gates

Do not call the product production-ready until all of these exist and have been exercised:

- approved open operating policies;
- real authentication and backend authorization;
- PostgreSQL migrations and tested restoration;
- a durable scheduled worker;
- cross-device live update and refetch recovery;
- structured logging, health checks, and alerting;
- privacy and retention decisions;
- HTTPS and secure secret management;
- pilot data migration or clean initialization plan;
- supported-device browser verification; and
- a staff training and incident fallback procedure.

Deployment provider and topology are intentionally not selected in this document.
