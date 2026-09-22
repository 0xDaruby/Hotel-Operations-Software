# Hotel Operations Product Requirements Document

Status: Draft product authority  
Version: 0.1  
Updated: 2026-09-22

## 1. Product summary

Hotel Operations is a staff-only system for running the daily room lifecycle of one hotel. It gives a remote Owner or Manager a reliable view of occupancy, room condition, maintenance blocks, staff actions, and money recorded from walk-in stays. Receptionists record and manage stays. Supervisors inspect rooms and report or resolve maintenance issues. Housekeepers continue to coordinate in person and do not have app accounts.

The product replaces fragmented verbal updates with one shared operational record. It is not a guest booking product, a guest portal, a payment processor, or a full accounting system.

This document separates confirmed requirements from proposed implementation rules and open decisions. A prototype behavior is not automatically a product requirement.

## 2. Requirement status

- **Confirmed** means the user has approved the requirement.
- **Proposed** means the rule is recommended or demonstrated in the prototype but still needs approval.
- **Open** means a product decision is required before production behavior can be finalized.

If this PRD conflicts with a later explicit user decision, the later decision wins and both this file and `MEMORY.md` must be updated.

## 3. Problem

Hotel staff coordinate occupancy, cleaning, inspection, and maintenance through in-person communication. That makes it difficult for a remote owner to know:

- which rooms are occupied;
- which rooms can accept a guest now;
- which rooms still need a personal inspection;
- which rooms are blocked by maintenance;
- what staff members changed and when; and
- how much stay payment was recorded on a given day.

The operational risk is not simply missing information. It is false confidence: a room can appear available even though a guest has not departed, an inspection is unresolved, or maintenance is still open.

## 4. Product goals

### 4.1 Confirmed goals

1. Create one current, shared view of room occupancy, inspection condition, and maintenance restrictions.
2. Let reception record and manage walk-in stays without creating guest accounts.
3. Require an attributed personal inspection before cleanliness is approved.
4. Preserve consequential changes in an activity history that the owner can understand.
5. Show lightweight daily payment records without pretending to be an accounting ledger or payment gateway.
6. Keep the main workflows usable on desktop, tablet, and mobile-sized screens.

### 4.2 Success measures to establish during pilot

The product should make the following measurable. Targets remain open until a pilot baseline exists.

- Percentage of occupied rooms with accurate departure deadlines.
- Percentage of rooms awaiting inspection beyond the operating target.
- Number of attempted arrivals blocked because the room was not eligible.
- Time from confirmed departure to approved inspection.
- Number and age of open maintenance issues.
- Percentage of consequential actions carrying actor, time, and reason where required.
- Agreement between recorded daily payments and the hotel's external cash or payment records.

## 5. Non-goals

The first production scope does not include:

- guest accounts, guest login, or a guest-facing interface;
- online reservations or remote booking management;
- online payment collection or gateway settlement;
- refunds, chargebacks, or accounting reconciliation;
- an accountant role;
- automated WhatsApp or customer-support messaging;
- housekeeper profiles, task claims, or inspection assignments;
- payroll, inventory, restaurant, event, or point-of-sale operations;
- multi-property management;
- permanent deletion of stay or activity history; or
- automatic readiness based only on time passing or cleaning being reported.

## 6. Users and permissions

### 6.1 Owner or Manager

The Owner or Manager needs remote operational visibility. They can view all rooms, stays, inspection status, maintenance issues, payment records, and activity history. Exact permission to perform reception and inspection actions in the production product remains open; the prototype allows some owner actions only to demonstrate workflows.

### 6.2 Receptionist

The Receptionist records a walk-in arrival into an eligible room, manages the active stay, confirms departure, corrects mistakes with reasons, and sees the room information needed to avoid unsafe assignment.

Reception cannot change category prices, approve cleanliness, resolve maintenance, manage staff accounts, erase activity history, or permanently delete a stay.

### 6.3 Supervisor

Each Supervisor has a unique profile. Supervisors share the same live inspection queue and room information. They personally inspect rooms, record inspection outcomes, report maintenance issues, and view attributed activity relevant to operations.

Supervisors coordinate in person. The product must not add inspection claims, assignment controls, or “being inspected by” indicators.

### 6.4 Housekeeper

Housekeepers do not have app profiles in this scope. They perform cleaning and coordinate with supervisors in person. The system must not create a “cleaning in progress” state that implies tracked housekeeper work.

## 7. Product model

### 7.1 Confirmed operating facts

The system must preserve these facts independently:

- whether a room has an active stay;
- whether an inspection is pending, approved, needs attention, or could not be completed;
- whether one or more maintenance issues block assignment; and
- the stay's scheduled departure deadline.

### 7.2 Proposed readiness rule

For implementation, **Ready for check-in** should be a derived condition, not a value staff can set directly. A room is ready only when all of the following are true:

1. it has no active stay;
2. its latest required inspection is approved; and
3. it has no open maintenance issue that blocks assignment.

This derived model is recommended because occupancy, cleanliness, and maintenance can change independently. The final labels and state combinations require approval.

## 8. Functional requirements

### 8.1 Authentication and staff identity

- **FR-001 — Confirmed:** Only Owner or Manager, Receptionist, and Supervisor profiles are in scope.
- **FR-002 — Confirmed:** Every Supervisor uses a unique profile so inspections and history name the actual actor.
- **FR-003 — Proposed:** The Owner or Manager creates, disables, and resets staff access; staff cannot self-register.
- **FR-004 — Confirmed:** Authorization is enforced by the backend, not only by hiding controls in the interface.
  - Status note: targeted live authenticated verification passed on 2026-09-22. Receptionist and Supervisor blocked RPC calls returned HTTP 400 with Postgres code `P0001` role-guard responses, while receptionist `record_arrival` and Supervisor `submit_inspection` succeeded. The full UI audit was not required for this verification pass.
- **FR-005 — Proposed:** Disabled users lose future access without removing their historical attribution.

### 8.2 Room inventory and categories

- **FR-010 — Confirmed:** The system shows every hotel room in natural numeric order with its room number, category, occupancy, inspection condition, and maintenance block.
- **FR-011 — Confirmed:** Reception can assign only a room that is eligible for check-in.
- **FR-012 — Confirmed:** A maintenance issue prevents new assignment and remains visible to reception and the owner.
- **FR-013 — Confirmed:** Reception cannot change category prices.
- **FR-014 — Proposed:** Category price changes apply only to new stays; an active continuous stay retains its original rate.
- **FR-015 — Open:** Define final room categories, room inventory, category prices, and whether individual rooms may have price overrides.

### 8.3 Walk-in arrival

- **FR-020 — Confirmed:** Reception records the guest, selected ready room, category, entry date and time, planned departure deadline, paid duration, and amount received.
- **FR-021 — Confirmed:** The current entry time is captured by the system.
- **FR-022 — Confirmed:** The initial stay is treated as paid in full for the recorded duration.
- **FR-023 — Confirmed:** If two receptionists attempt to place guests into the same room, only one arrival succeeds; the other receives a clear conflict message.
- **FR-024 — Proposed:** Guest name is required and phone number is optional.
- **FR-025 — Proposed:** The amount is calculated from the selected category's effective rate and paid days, while the receptionist confirms that payment was received outside the system.

### 8.4 Stay duration and departure

- **FR-030 — Confirmed:** Each paid day lasts 24 hours from arrival. A one-day stay starting at 3:00 p.m. is due at 3:00 p.m. the next day.
- **FR-031 — Confirmed:** At the scheduled deadline, the stay displays **Departure due** but remains active and the room remains occupied.
- **FR-032 — Confirmed:** Time expiry must never make a room vacant, ready, or assignable.
- **FR-033 — Confirmed:** Reception explicitly confirms departure. Confirmation ends occupancy and creates a fresh inspection requirement.
- **FR-034 — Confirmed:** A fresh departure inspection is required even when a daily occupied-room inspection passed earlier that day.
- **FR-035 — Confirmed:** Early departure is allowed and preserves the recorded payment. Any refund is handled outside the product.

### 8.5 Stay extension

- **FR-040 — Confirmed:** Reception can extend an active stay, including when departure is due but not yet confirmed.
- **FR-041 — Confirmed:** Each added paid day extends the existing departure deadline by 24 hours.
- **FR-042 — Confirmed:** The interface shows the additional charge before saving.
- **FR-043 — Confirmed:** The extension retains the original stay rate even if the category price later changes.
- **FR-044 — Confirmed:** An extension creates a separate payment record on the day the additional money was received.
- **FR-045 — Confirmed:** The original payment remains on its original day and the stay's cumulative recorded payment increases only by the extension amount.
- **FR-046 — Confirmed:** Extension does not trigger departure inspection or clear inspection or maintenance facts.

### 8.6 Room move

- **FR-050 — Confirmed:** Reception can move an active guest to another eligible room without ending the stay.
- **FR-051 — Confirmed:** The move does not create a duplicate stay or count the original payment twice.
- **FR-052 — Confirmed:** The previous room becomes awaiting inspection.
- **FR-053 — Open:** Confirm pricing behavior when the destination belongs to a different category. The prototype retains the original rate.

### 8.7 Corrections and voids

- **FR-060 — Confirmed:** Reception can correct guest and active-stay details with a required reason.
- **FR-061 — Confirmed:** Consequential corrections preserve the original value, corrected value, actor, timestamp, and reason.
- **FR-062 — Confirmed:** A payment-record correction describes the operational record; it does not prove money was collected or refunded.
- **FR-063 — Confirmed:** Reception cannot permanently delete a stay. A mistaken record is voided with a reason and preserved history.
- **FR-064 — Confirmed:** A voided stay and its payments are excluded from active records and totals but remain auditable.
- **FR-065 — Confirmed:** Voiding must not automatically make the room clean or ready.
- **FR-066 — Open:** Define detailed amount recalculation rules and whether closed historical stays can be corrected.

### 8.8 Daily and departure inspections

- **FR-070 — Confirmed:** Supervisors see rooms and a daily preparation or inspection queue driven by relevant events.
- **FR-071 — Confirmed:** Guest departure creates an inspection requirement automatically.
- **FR-072 — Confirmed:** Occupied rooms become due for a daily inspection at the configured operating cutoff.
- **FR-073 — Confirmed:** Guest temporary absence does not end occupancy.
- **FR-074 — Confirmed:** Passing an occupied-room inspection preserves occupancy.
- **FR-075 — Confirmed:** An inspection requires the Supervisor to confirm the recorded outcome reflects personal verification.
- **FR-076 — Confirmed:** If inspection fails or guest access is unavailable, the requirement remains unresolved and records the reason.
- **FR-077 — Confirmed:** Unfinished inspection work carries forward and can be reinspected later.
- **FR-078 — Confirmed:** Previously approved vacant rooms that remain unused must not be needlessly returned to awaiting inspection.
- **FR-079 — Confirmed:** When another Supervisor already completed the inspection, a stale submission is rejected and identifies who completed it and when.
- **FR-080 — Confirmed:** The queue must not include claim, assignment, or ownership controls.
- **FR-081 — Proposed:** Common outcomes appear as quick choices before free text to reduce repetitive typing.
- **FR-082 — Open:** Confirm the daily inspection time, hotel time zone, cutoff behavior for new arrivals, and whether overlapping pending causes are consolidated.

### 8.9 Maintenance

- **FR-090 — Confirmed:** Supervisors can report a room maintenance issue using the room, a common issue type, and limited free text for special detail.
- **FR-091 — Confirmed:** Common types include air conditioning and broken furniture; the final taxonomy remains configurable.
- **FR-092 — Confirmed:** Open maintenance blocks the room from new assignment without ending an existing stay.
- **FR-093 — Confirmed:** Resolving one issue must not resolve other issues for the room.
- **FR-094 — Confirmed:** Resolving maintenance must not approve cleanliness or clear an inspection requirement.
- **FR-095 — Confirmed:** Owner or Manager and Supervisor may each resolve maintenance issues independently; both approvals are not required.
- **FR-096 — Open:** Confirm the note length limit. The prototype uses 250 characters.

### 8.10 Payment records

- **FR-100 — Confirmed:** The owner can see stay payments recorded for a selected day.
- **FR-101 — Confirmed:** The view distinguishes initial payments from extension payments and links both to the stay.
- **FR-102 — Confirmed:** An extension payment contributes only to the day it was recorded.
- **FR-103 — Confirmed:** The system is a payment-recording view, not a processor, bank ledger, refund system, or accounting system.
- **FR-104 — Proposed:** The primary label is **Payments recorded today** rather than **Revenue**.
- **FR-105 — Open:** Confirm treatment of corrections in historical daily totals and define the external reconciliation process.

### 8.11 Activity history

- **FR-110 — Confirmed:** Consequential activity records the actor, action, affected room or stay, and timestamp.
- **FR-111 — Confirmed:** Corrections and voids also record a reason and retain before-and-after facts where applicable.
- **FR-112 — Confirmed:** Activity history cannot be erased by Receptionists.
- **FR-113 — Confirmed:** Supervisors can see activity attributed to the actual user.
- **FR-114 — Proposed:** The Owner or Manager can view all activity; staff can filter between all permitted activity and their own actions.
- **FR-115 — Proposed:** Activity entries are append-only in normal product operation.

## 9. Primary workflows

### 9.1 Record an arrival

1. Reception opens the ready-room list.
2. Reception selects a specific eligible room.
3. Reception enters the guest, paid days, and optional contact detail.
4. The system shows the category rate, calculated amount, and departure deadline.
5. Reception confirms payment was received outside the system.
6. The backend atomically creates the stay and payment record and occupies the room.
7. If eligibility changed, the save fails without a partial stay or payment.

### 9.2 Extend an active stay

1. Reception opens the active stay.
2. Reception chooses the added days.
3. The system uses the original stay rate and previews the additional charge and revised deadline.
4. Reception confirms the additional payment.
5. The system appends the extension payment and updates the deadline in one transaction.

### 9.3 Confirm departure

1. Reception opens an active or departure-due stay.
2. Reception confirms that the guest has actually left.
3. The system ends occupancy.
4. The system creates a fresh departure inspection requirement.
5. The room remains unavailable until the required inspection passes and no maintenance block remains.

### 9.4 Inspect a room

1. A Supervisor opens a due room from the shared queue.
2. The Supervisor physically verifies the room.
3. They record passed, needs attention, or access unavailable, using a quick finding or note.
4. They confirm personal verification and submit.
5. The backend accepts only a current requirement version. A stale duplicate is rejected with the latest completion details.

### 9.5 Report and resolve maintenance

1. An Owner / Manager or Supervisor selects the room and issue type and adds concise detail.
2. The system immediately blocks new assignment.
3. An authorized user records resolution detail for that specific issue.
4. Other open issues and inspection conditions remain unchanged.

## 10. Role capability matrix

| Capability | Owner or Manager | Receptionist | Supervisor |
| --- | --- | --- | --- |
| View room board | Confirmed | Confirmed | Confirmed |
| View active stays needed for role | Confirmed | Confirmed | Limited to operational context |
| Record or change stays | No | Confirmed | No |
| View payment records | Confirmed | Operational detail only | No |
| Approve inspection | No | No | Confirmed |
| Report maintenance | Confirmed | No | Confirmed |
| Resolve maintenance | Confirmed | No | Confirmed |
| View activity | All | Permitted operational activity | Confirmed operational activity |
| Manage staff access | Confirmed | No | No |
| Change category prices | Proposed | No | No |

## 11. Conceptual data model

This model is a proposed engineering representation of the confirmed workflows.

- **Property:** hotel identity, time zone, inspection schedule, and settings.
- **User:** staff identity, role, access state, and authentication reference.
- **RoomCategory:** category name, current price, and display order.
- **Room:** room number, category, active or inactive inventory state.
- **Stay:** guest details, current room, arrival, departure deadline, original rate, status, and version.
- **StayRoomMove:** previous room, destination room, reason, actor, and time.
- **PaymentRecord:** stay, type, amount, received time, recorded time, actor, and void state.
- **InspectionRequirement:** room, trigger, due time, status, version, and completion reference.
- **InspectionAttempt:** outcome, findings, actor, and time.
- **MaintenanceIssue:** room, type, detail, status, reporter, resolution, and timestamps.
- **ActivityEvent:** append-only actor and business-action record with structured before-and-after facts.

Payment values must use an exact decimal or minor-unit representation, never binary floating point.

## 12. Non-functional requirements

### 12.1 Correctness and concurrency

- Eligibility-changing actions must execute in database transactions.
- Arrival must enforce at most one active stay per room.
- Inspection submission, stay edits, departure, move, and issue resolution must reject stale versions.
- Scheduled checks may mark work due but must never confirm departure or approve inspection.
- Business events and their audit records must commit together.

### 12.2 Security and privacy

- Every private route and API action requires authentication and backend authorization.
- Staff sessions must use secure cookies and production HTTPS.
- Store only guest details needed for operations.
- Do not expose payment records or guest contact details to roles that do not need them.
- Log security-relevant access and permission changes without storing secrets in logs.
- Retention, privacy notices, and incident procedures must be defined before production launch.

### 12.3 Reliability

- The shared view must converge quickly after another staff member changes a room.
- Scheduled work must run independently of an open browser.
- A failed job may retry safely without duplicating requirements or actions.
- Production backups and restoration must be tested before live use.

### 12.4 Accessibility and responsive use

- All workflows must be keyboard operable.
- Focus must be visible and restored after dialogs close.
- Status must not rely on colour alone.
- Forms require programmatic labels, clear errors, and appropriately sized touch targets.
- Support reduced motion.
- Primary pages must avoid horizontal page overflow at 390, 768, and 1440 pixel widths; wide data tables may use a clearly contained horizontal scroller when necessary.

### 12.5 Performance targets for pilot validation

- Primary pages should become usable within three seconds on the hotel's expected network and devices.
- A successful operational action should visibly confirm within two seconds under normal conditions.
- Realtime updates should normally appear to other active staff within five seconds.

These are proposed targets and require measurement on real hardware and connectivity.

## 13. Acceptance scenarios

1. **Concurrent arrival:** two Receptionists choose the same ready room; one succeeds and one receives a conflict, leaving one active stay and one initial payment.
2. **Departure deadline:** time reaches the deadline; the stay says Departure due, remains active, and the room remains occupied and unavailable.
3. **Paid extension:** a ₦60,000 original payment yesterday and ₦30,000 extension today leave yesterday unchanged, add ₦30,000 today, and show ₦90,000 cumulative for the stay.
4. **Occupied inspection:** a Supervisor passes a daily inspection; the stay and occupancy remain active.
5. **Fresh departure requirement:** a daily inspection passes at 2:00 p.m. and departure is confirmed at 4:00 p.m.; a new departure inspection is required.
6. **Failed inspection carryover:** a room needs attention and the operating day changes; the unresolved requirement remains visible.
7. **Duplicate inspection:** two Supervisors open the same requirement; after one submits, the other's stale submission is rejected and names the completer.
8. **Maintenance isolation:** a room has two open issues; resolving one leaves the other block and cleanliness condition unchanged.
9. **Room move:** an active guest moves to an eligible room; the stay and original payment are not duplicated, and the previous room awaits inspection.
10. **Correction:** changing paid days records the original and new values, actor, time, and reason and makes the amount effect understandable.
11. **Void:** voiding a duplicate entry removes it from active totals, preserves history, and leaves the room awaiting inspection rather than ready.
12. **Authorization:** Reception cannot approve inspection, resolve maintenance, change prices, delete history, or access staff administration through either UI or API.
  - Status note: targeted live API role enforcement was verified with fresh authenticated accounts on 2026-09-22. Receptionist inspection and maintenance calls, and Supervisor reception calls, returned HTTP 400 / `P0001` role guards; legitimate role actions succeeded. No category-price-change RPC exists to invoke. The cron wrapper remains a documented non-blocking live-verification gap.

## 14. Open product decisions

1. Hotel time zone.
2. Daily inspection time and new-arrival behavior around the cutoff.
3. Final room-state labels and pending-requirement consolidation.
4. Maintenance resolution authority.
5. Final guest fields and maintenance note limit.
6. Owner or Manager operational permissions.
7. Category inventory, rates, effective-date behavior, and cross-category move pricing.
8. Historical correction calculations and whether closed stays may be corrected.
9. External payment reconciliation process.
10. Data retention, privacy, backup retention, and audit export requirements.
11. Pilot success targets and supported hotel devices or browsers.

## 15. Prototype relationship

`03-hotel-operations.html` demonstrates the main operations flows with browser-local sample data. It validates interaction direction and responsive layout, not production authentication, authorization, persistence, cross-device synchronization, scheduled work, backup, or deployment. Its disclosed assumptions remain proposals until approved here and recorded in `MEMORY.md`.
