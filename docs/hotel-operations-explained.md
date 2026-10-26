# Hotel Operations: how the whole system fits together

An illustrated explanation of the current repository, reviewed on 22 October 2026. The drawings are conceptual illustrations, not screenshots or additional app features.

Hotel Operations is a shared working record for one hotel's staff. Reception manages walk-in stays, supervisors verify room condition, and owners see the property's position. The system connects those actions so that a room's availability, its payment records and its history agree with one another.

## 1. One hotel, three responsibilities

![Three staff roles working in one shared hotel ledger](../assets/hotel-operations-system-illustrations/01-shared-hotel-record.png)

Each staff member has an individual account. Their role determines the pages and actions available to them.

| Role | Main responsibility | Important boundary |
| --- | --- | --- |
| Receptionist | Record arrivals, extend and move stays, confirm departures, and record stay payments. | Cannot approve inspections or manage staff access. |
| Supervisor | Personally inspect rooms, record findings, and report or resolve maintenance. | Cannot make reception's stay changes. |
| Owner / Manager | Review occupancy, attention items, recorded payments and activity; manage staff; report or resolve maintenance. | Owner oversight does not grant reception's stay mutations or the supervisor's inspection approval. |

The shared record lives in the database. Each role sees an appropriate view of it. Housekeepers coordinate outside the app; they do not have a separate account role in the current product.

## 2. The working connection: browser, application, database

![Staff browser passes work through the Netlify app to Supabase, with results returning through the app](../assets/hotel-operations-system-illustrations/02-app-and-database.png)

**The browser** is the staff member's workspace on a phone or computer. React builds the interactive parts: forms, room cards, filters and dialogs.

**Next.js in `apps/web`** serves the pages and runs the server-side application work. Netlify hosts this application. This means the visible interface and its server actions belong to the same web app; a separate NestJS API is not required for the current workflows.

**Supabase Auth** manages staff sign-in and sessions. The browser also talks to Supabase for authentication; that identity connection is simplified in the picture. A valid sign-in is followed by a staff-profile check: the application needs to know the person's hotel, role, active status and whether password setup is pending.

**Supabase PostgreSQL** stores the hotel's records and executes the consequential business rules. Ordinary application reads and operational writes use the signed-in staff identity. Server actions call named database functions, also called RPCs, such as `record_arrival` or `submit_inspection`.

The operational write path is:

**Staff action → Next.js server action → Supabase database function → database checks and save → result → refreshed interface.**

The page is not the final authority. The database checks roles, hotel ownership, current record versions and room eligibility even if a request reaches it outside the normal interface. Row-level security limits which records a staff identity can read; database functions and ownership guards enforce the permitted changes.

## 3. How every page connects

| Page | What it answers | What connects it to the rest |
| --- | --- | --- |
| Hotel Overview | How is the hotel doing, and what needs attention? | Combines room, stay, inspection, maintenance, payment and activity data for the owner. |
| Room board | Which rooms are occupied, empty or eligible for arrival? | Combines inventory with active stays and unresolved room-condition work. |
| Guest stays | Who is staying, for how long, and what changed? | Links arrivals, extensions, room moves, corrections and departures to rooms and payment records. |
| Departure due | Which stays need reception's attention? | Uses active stays and their paid departure deadlines. Time passing does not confirm a departure. |
| Inspections | What must be personally checked? | Stores a supervisor's outcome against a room's inspection requirement. Unresolved requirements affect readiness. |
| Maintenance | Which issues remain open? | Each issue belongs to a room and can independently keep it unavailable. Reception can view; supervisors and owners can act. |
| Payments | What stay money was recorded on a selected day? | Owner view of payment records created by arrival and extension operations. |
| Activity log | Who did what, when, and why? | Consequential database actions produce attributed events; role-scoped history provides context. |
| Staff | Who can use the hotel workspace? | Owner controls account setup and access status, connected to Supabase Auth and staff profiles. |

Attention badges use record-derived counts. The overview reads a database statistics function, with a checked fallback for installations where that function is missing. The summary is another view of operational data, not a separate manually maintained ledger.

## 4. Room readiness is a calculation

![Four independent eligibility checks align before the room key can turn](../assets/hotel-operations-system-illustrations/03-room-readiness.png)

A room is ready only when all four facts agree:

1. The room is active in inventory.
2. It has no active stay.
3. It has no unresolved inspection requirement.
4. It has no open maintenance issue.

For the authenticated caller, the database also verifies that the room belongs to their hotel and that their staff profile is active.

Consider room 104. Reception confirms the guest's departure. The room becomes unoccupied, and a departure inspection is required. Cleaning can happen in person, but that alone does not clear the inspection. A supervisor personally checks the room and records the outcome. If a leaking tap is still an open maintenance issue, the room remains blocked. Once all open issues and inspection requirements are cleared, the room can become eligible again.

Approving an inspection does not resolve maintenance. Resolving one repair does not close the other issues in that room. A room can have several relevant facts at the same time, which is why the board displays them separately.

The database scheduler creates daily inspection requirements for active stays. The configured SQL schedule is 07:00 UTC, or **08:00 in Lagos**. It does not automatically approve rooms, and the code's schedule is not evidence that a particular live run succeeded today.

## 5. What happens when reception records an arrival

![Stay, payment record and activity secured together in one transaction](../assets/hotel-operations-system-illustrations/04-arrival-transaction.png)

Suppose the configured room rate is ₦40,000 per 24 hours and the guest pays for two days.

1. Reception chooses an eligible room and enters the guest details and paid days. The interface presents an expected ₦80,000 charge.
2. The server action sends the request to `record_arrival`, carrying the signed-in session.
3. The database checks the receptionist's role and hotel, locks the room against conflicting operations, and checks readiness again. A room that looked ready a moment ago may no longer be eligible.
4. It reads the current rate and compares the requested amount with its own calculation. It uses database time for the arrival and sets the paid deadline 48 hours later.
5. It saves the stay, initial payment record and attributed activity event in one transaction. If the operation fails, those writes do not partially commit.
6. The application receives success or a readable error and refreshes the relevant views.

This is payment **recording**: it does not move money through a payment gateway. Extensions add payment records and extend the paid deadline. Confirming departure closes the active stay and creates inspection work. Room moves connect a stay to a new eligible room and require inspection of the old room. Corrections and voids require reasons and preserve an activity trail.

Existing-record updates carry an expected version. If someone else has changed the record, the database can reject the stale request so the staff member reviews the current state instead of overwriting it. Database row locks and constraints also coordinate conflicting room operations.

## 6. How the records relate

Think of the database as a set of linked registers:

| Register | Connection |
| --- | --- |
| `hotels` | The property to which inventory and operational records belong. |
| `auth.users` + `staff_profiles` | The login identity plus the person's hotel, role, display name and access state. |
| `room_categories` | A property's room types and configured rates. |
| `rooms` | An individual room, linked to its property and category. |
| `stays` | A guest's stay, linked to a room and hotel, with its original rate, paid days and deadlines. |
| `payment_records` | Initial and extension payment entries linked to a stay and hotel. |
| `stay_room_moves` | The history of room changes for a stay. |
| `inspection_requirements` | Inspection work and outcomes linked to a room and hotel. |
| `maintenance_issues` | Independent issues linked to a room and hotel. |
| `activity_events` | Attributed records of business actions, with relevant room, stay, reason and detail. |

Those links let an owner move from a summary to the records behind it. They also let database guards reject mismatched combinations, such as attaching a room from one hotel to another hotel's stay.

## 7. Signing in and bringing staff on board

The initial hotel, inventory and Owner account are prepared by an administrator. There is no default public signup that creates a working hotel automatically.

The Owner can then create a Receptionist or Supervisor. The server creates an Auth identity and an inactive, pending staff profile, then requests a password-setup email. The recipient follows the callback and sets a password; successful setup completes the pending profile. Failed email requests leave access inactive and offer a retry. Cancellation prevents a pending invitation from activating access.

This is a coordinated sequence across Auth, the database and email, rather than one database transaction covering all external services. The code has explicit failure and cleanup paths for the stages.

Account administration uses a server-only Supabase service-role key. Ordinary hotel actions use the user's session. The publishable Supabase key is intended for public application configuration; the privileged service-role key must remain on the server. The configured application origin determines trusted setup callback destinations.

## 8. How staff see changes and recover from interruptions

After successful operations, the app invalidates relevant page data. While a page is visible and online, the refresh controller schedules another refresh 20 seconds after the previous refresh completes. Returning focus to the app or reconnecting also requests a refresh.

That is periodic refresh and recovery, rather than an implemented WebSocket or Supabase Realtime subscription. Another person's screen can briefly show an older snapshot; database checks still decide whether an attempted action is valid.

Pending forms prevent duplicate submissions and freeze submitted input. The locally tested inspection, maintenance and arrival failure paths preserve drafts and avoid claiming an unconfirmed save succeeded. This does not make the app an offline system: saving still needs its server and database. After a lost response, staff must review the current record because a request may have committed before its response disappeared.

## 9. How development reaches the live app

![GitHub source is built into a published Netlify app while Supabase data has a separate migration path](../assets/hotel-operations-system-illustrations/05-code-to-production.png)

**Local edits → reviewed Git commit → GitHub `main` → Netlify build → published web app.**

The repository's Netlify configuration runs `pnpm --dir apps/web build` and publishes the Next.js output. Netlify serves the resulting site and server handler. Its environment settings connect that app to the selected Supabase project.

Database changes follow a separate process. SQL migrations define tables, permissions, functions and scheduling. Pushing frontend code does not itself apply those SQL changes to the live Supabase database. The migration manifest describes the reviewed clean-database replay order, including the historical scheduler repair. The clean bootstrap is for an empty project, not an upgrade command for an existing hotel.

Changing the Supabase configuration points an installation at a different backend; it does not automatically create a second hotel or a multi-property management service.

The Netlify deployment was last confirmed in this chat on 19 October 2026 for commit `5e057c9`. This explanation checks the current repository; it is not a new live deployment or database-health audit.

## 10. Where the work lives in this repository

| Location | Current purpose |
| --- | --- |
| `apps/web/src/app` | Pages, route layouts and authentication callbacks. |
| `apps/web/src/features` | Staff workflows, interactive workspaces, data reads and server actions. |
| `apps/web/src/components` | Shared navigation, dialogs, feedback and refresh behavior. |
| `apps/web/src/lib/supabase` | Browser/session/server connections and server-only administration. |
| `supabase/migrations` | The operational database rules, permissions and schema changes. |
| `supabase/bootstrap` | Clean-project foundation, scheduler repair and migration manifest. |
| `tests` and `scripts` | Web/database checks, isolated browser fixtures and database-plan tooling. |
| `docs`, `prd.md`, `design.md`, `setup.md` | Product decisions, design direction, installation instructions and verification evidence. |
| `apps/api`, `apps/worker`, `packages/domain`, `packages/contracts`, Prisma | Scaffolds outside the current operational path. The running web app calls Supabase, and scheduling is in database cron. |

The actual business rules are concentrated in the SQL functions with supporting application code. Folder names and older architecture proposals should not be mistaken for additional running services. Cloudflare/vinext configuration is also present as an alternative build path; Netlify is the deployment confirmed earlier in this chat.

## 11. What has been checked, and what the project covers

The saved validation report records 104 web tests, database replay and recovery checks, 11 isolated UI scenario groups and a production build passing. The UI fixture uses production components and real SQL functions in a disposable embedded database, with synthetic users and loopback transport. It is separate from live hotel data.

Physical phone keyboards, Safari, a comprehensive accessibility assessment, independent production PostgreSQL connection behavior and live backup restoration require their own evidence. The illustrations explain the implemented design; they do not certify those operational checks.

The current product covers staff-only, single-property walk-in operations. Online reservations, guest accounts, payment processing, payroll, full accounting and fleet provisioning are outside that working scope.

## Source trail

- [Product scope and permissions](../prd.md)
- [Current installation and database setup](../setup.md#current-setup--2026-10-16)
- [Navigation and page access](../apps/web/src/components/navigation-config.ts)
- [Authenticated staff profile](../apps/web/src/features/auth/staff-profile.ts)
- [Stay server actions](../apps/web/src/features/stays/actions.ts)
- [Room operations and transactions](../supabase/migrations/0012_serialize_room_operations.sql)
- [Hotel ownership guards](../supabase/migrations/0011_operational_tenant_guards.sql)
- [Refresh scheduling](../apps/web/src/components/refresh-controller.ts)
- [Staff provisioning](../apps/web/src/features/staff/provisioning.ts)
- [Database scheduler](../supabase/bootstrap/repair-scheduler.sql)
- [Netlify build configuration](../netlify.toml)
- [UI validation evidence](verification/2026-10-19-ui-decisions.md)

All five illustrations are core reading aids: shared work, connections, eligibility, transaction integrity and delivery. Generated with the built-in image tool using the annotated-illustration skill. Original generated files are retained; final prompts are saved beside the illustrations.
