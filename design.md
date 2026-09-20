# Hotel Operations Design Direction

Status: Initial design authority derived from the approved prototype direction  
Updated: 2026-09-19

## 1. Design intent

Hotel Operations should feel calm, grounded, and trustworthy while supporting dense daily work. The interface is a working staff tool, not a luxury marketing site. Its visual character comes from the first prototype's earth palette: sage, rose, tan, beige, and brown. Warm paper surfaces and restrained typography should make operational information feel human without softening urgency or hiding state.

The design must prioritize fast scanning, clear eligibility, and confident action. A receptionist should understand whether a room can accept a guest without interpreting colour. A supervisor should move through an inspection queue with little repetitive typing. A remote owner should see the hotel's current position and recent activity without reconstructing it from multiple screens.

## 2. Source of truth

The initial colour brand is preserved from the first prototype:

| Token | Value | Brand role |
| --- | --- | --- |
| Sage | `#98A086` | Primary brand field, navigation, calm operational emphasis |
| Rose | `#A76D5E` | Serious attention and destructive-action family |
| Tan | `#C4A071` | Warm highlight, pending attention, notice accents |
| Beige | `#DFCCB1` | Secondary brand surface and supporting warmth |
| Brown | `#846044` | Primary action and strong brand accent |

These five colours are the brand anchors. Interface colours derived from them may be lightened or darkened for legibility, hierarchy, and status. Do not replace the brand with generic blue, purple gradients, neon accents, or cold dashboard grey.

The current prototype's readable source is `operations-shell.html`. The standalone `03-hotel-operations.html` is generated and should not become a competing design-token source.

## 3. Experience principles

### 3.1 Operational truth before decoration

Show occupancy, inspection condition, maintenance blocks, and departure state as separate facts. Never use a beautiful single status pill to hide an unsafe combination.

### 3.2 Warm, not ornamental

Use the earth palette, paper-like surfaces, considered serif headings, and quiet borders. Avoid decorative hotel imagery, glass effects, large gradients, excessive shadows, or animation that competes with the work.

### 3.3 Scan first, inspect second

Cards and summary rows should reveal the room number, category, occupancy, readiness, and blocking reason at a glance. Details and history can appear after selection.

### 3.4 Low typing for repeated work

Offer clear quick choices for common inspection and maintenance findings. Free text remains available for exceptional detail and required reasons.

### 3.5 Colour supports language

Every state requires a text label and, where useful, a simple icon or dot. Colour is reinforcement, never the only signal.

### 3.6 One clear next action

Each page and dialog should have one visually dominant action. Dangerous or history-changing actions must state their consequence before confirmation.

## 4. Colour system

### 4.1 Brand primitives

```css
:root {
  --palette-sage: #98A086;
  --palette-rose: #A76D5E;
  --palette-tan: #C4A071;
  --palette-beige: #DFCCB1;
  --palette-brown: #846044;
}
```

### 4.2 Proposed semantic tokens

The production UI should map brand primitives to semantic tokens rather than using raw hex values in components.

```css
:root {
  --canvas: #F3EEE6;
  --surface: #FAF6EF;
  --surface-raised: #FFFDFC;
  --text: #302A23;
  --text-muted: #6F665D;
  --border: #D8CABB;

  --brand-field: #98A086;
  --brand-action: #715039;
  --brand-action-hover: #57412F;
  --brand-soft: #DFCCB1;

  --status-ready-bg: #DFE5D5;
  --status-ready-fg: #3F4D33;
  --status-occupied-bg: #CDD3BD;
  --status-occupied-fg: #3A472F;
  --status-pending-bg: #EDDBBC;
  --status-pending-fg: #704D28;
  --status-danger-bg: #EBD1C8;
  --status-danger-fg: #793D32;
  --status-neutral-bg: #EAE2D7;
  --status-neutral-fg: #5C5147;

  --focus-ring: #765031;
}
```

Token values may be adjusted after formal contrast testing, but the five brand primitives remain fixed unless the user approves a brand change.

### 4.3 Usage rules

- Sage carries large stable brand areas such as desktop navigation and calm summary emphasis.
- Brown carries primary actions, selected navigation, and strong interactive emphasis.
- Tan carries pending or attention states that are not destructive.
- Rose carries destructive actions, serious failures, and unresolved risk.
- Beige carries secondary surfaces and supporting warmth.
- Warm off-white is the default canvas; pure white is reserved for raised or form surfaces.
- Large coloured areas should be quiet and low contrast; small interactive and status elements may use stronger contrast.
- Never assign the same treatment to **Ready** and **Occupied** even though both may use green-derived colours.

## 5. Typography

### 5.1 Direction

Use a restrained editorial serif for page titles, room numbers, and large metrics. Use a highly legible sans serif for controls, labels, tables, and body text. The prototype uses a Georgia-style display face and Segoe UI-style body face; production may use packaged fonts only after performance, licensing, and rendering checks.

Proposed stacks:

```css
--font-display: Georgia, "Times New Roman", serif;
--font-body: "Segoe UI", Inter, Arial, sans-serif;
```

### 5.2 Type scale

| Use | Desktop | Compact |
| --- | --- | --- |
| Page title | 40–44 px | 30–34 px |
| Section title | 23–28 px | 21–24 px |
| Room number or major metric | 32–38 px | 28–34 px |
| Card title | 15–17 px | 15–17 px |
| Body and controls | 14–16 px | 14–16 px |
| Supporting label | 11–12 px | 11–12 px |

Do not shrink operational content below 12 px to make a layout fit. Reflow or reduce content density instead.

## 6. Spacing, shape, and depth

Use a four-pixel base rhythm.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
```

- Compact controls: 6–8 px radius.
- Cards and panels: 10–12 px radius.
- Dialogs: 14–16 px radius.
- Pills are reserved for compact statuses, not generic decoration.
- Borders should provide most separation. Shadows remain soft, shallow, and rare.
- Primary touch targets must be at least 44 by 44 CSS pixels where practical.

## 7. Layout system

### 7.1 Desktop

- Use a persistent 220–240 px sage navigation rail.
- Keep the current profile and hotel context visible in the top bar.
- Constrain content to a readable maximum width while allowing room boards to use wider displays.
- Prefer a 12-column grid or equivalent fluid layout.
- Summary metrics may appear in a four-column strip when space permits.
- Room boards should use three or four columns depending on actual card content and viewport width.

### 7.2 Tablet

- Collapse the persistent rail into a compact rail or top-level drawer without losing the current page label.
- Use two-column room cards.
- Keep primary page actions visible without duplicating them.
- Do not force desktop tables into unreadable narrow columns; switch to structured rows or contained scrolling.

### 7.3 Mobile

- Use one content column.
- Provide a clear menu and current profile context.
- Stack page heading and primary action when necessary.
- Use one-column forms and full-width primary dialog actions.
- Keep room identity and blocking status above secondary detail.
- Dialogs may become near-full-screen sheets while preserving a visible title and close control.
- Validate at 390 by 650 and short-height screens, not only tall device mockups.

## 8. Navigation by role

Navigation is permission-driven, but hidden navigation is not authorization.

### Owner or Manager

- Overview
- Rooms
- Stays
- Inspections
- Maintenance
- Payments
- Activity
- Settings or Staff, after scope approval

### Receptionist

- Rooms
- Active stays
- Departure due
- Activity relevant to reception

The dominant action is **Record arrival**.

### Supervisor

- Inspections
- Rooms
- Maintenance
- Activity

The interface must not include My assigned rooms, Take inspection, or claim indicators.

## 9. Core component specifications

### 9.1 Room card

The room card is the product's most important repeated component.

Required hierarchy:

1. room number;
2. category;
3. occupancy label;
4. inspection condition;
5. maintenance block, if any;
6. departure deadline or due label for an active stay;
7. role-appropriate action.

Rules:

- Preserve natural room-number order.
- Use separate badges for occupancy and condition rather than one combined status.
- State the blocking reason in text.
- Do not show guest contact details on the board.
- Do not let card background colour become the only state signal.
- Avoid overcrowding the card with history; selection opens the detailed view.

### 9.2 Status badge

- Include a short text label.
- Use a small dot or simple icon only as reinforcement.
- Keep contrast readable in default, hover, and disabled contexts.
- Allow wrapping for longer labels such as **Guest access unavailable**.
- Do not animate routine status changes.

### 9.3 Summary metric

Use large serif numerals, a precise label, and one concise qualifier. Good examples are **Occupied rooms**, **Awaiting inspection**, **Open maintenance**, and **Payments recorded today**. Avoid vanity charts when the underlying count and action list are more useful.

### 9.4 Action row

Use for inspection, departure-due, and maintenance queues. Keep room number fixed and prominent, show the reason and elapsed or due time, then present one clear action. Rows must remain understandable when actions are unavailable.

### 9.5 Table

Use tables only where comparison across columns matters, such as payments and activity. Use concise headers, sufficient cell padding, sticky headers only when they add real value, and a contained horizontal scroller on small screens. Convert row actions into an overflow menu only if labels remain discoverable.

### 9.6 Dialog

- Move focus into the dialog and restore it to the invoking control on close.
- Place the consequence before destructive confirmation.
- Use one primary submit action and one quiet cancel action.
- Show field errors near their inputs and a concise summary when multiple fields fail.
- Disable submission only while the request is in progress; do not use disabled controls as the sole explanation.
- On a conflict, keep the user's safe input when possible and explain what changed.

### 9.7 Quick-choice findings

Display common inspection findings as compact choices before the optional note. Choosing an outcome must update the personal-verification statement. Free text becomes required when the room does not pass and the selected choice lacks sufficient detail.

## 10. Page direction

### 10.1 Owner overview

Lead with the current room position, inspection work, maintenance blocks, payments recorded today, and recent consequential activity. Favor counts and action lists over decorative charts. Every metric should lead to a relevant filtered page.

### 10.2 Room board

Provide category and operational filters, room-number search, and a visible result count. Filters must be combinable and easy to clear. A no-results state should name the filters and provide a recovery action.

### 10.3 Stays and departure due

Make departure due visually prominent without implying automatic checkout. The stay detail should group current stay facts, payment records, movement history, and correction history. **Extend stay** and **Confirm departure** are distinct actions with distinct consequences.

### 10.4 Inspection queue

Prioritize overdue and unresolved requirements, but do not assign them to individuals. Show why the inspection is due, current occupancy, previous unresolved reason, and maintenance context. Completing one item should update all active staff views.

### 10.5 Maintenance

Show open issues first and resolved history second. A room with several issues must display each separately. Resolution language must say that cleanliness and other issues are unaffected.

### 10.6 Payments

Use the title **Payments recorded** and default to the current hotel day. Present initial and extension entries separately, with stay and room context. Avoid accounting language such as profit, settlement, or available balance unless those capabilities are later approved.

### 10.7 Activity

Use a chronological stream with actor, action, object, and time. Reasons and before-and-after detail should expand without overwhelming the default view. Filters may include action type, role, room, date, and My activity where permitted.

## 11. Interaction and feedback

- Use direct, specific verbs: **Record arrival**, **Extend stay**, **Confirm departure**, **Record inspection**, **Report issue**, **Mark resolved**, **Void mistaken entry**.
- After save, confirm what changed and what remains required.
- Optimistic UI is acceptable only for reversible presentation changes. Consequential room, stay, payment, inspection, and maintenance changes wait for authoritative server success.
- For stale data, explain the new state and provide a review action rather than a generic failure.
- Prevent duplicate submission while a request is in flight.
- Preserve the original and corrected values in history, not necessarily in the transient success message.

## 12. Motion

Motion should communicate continuity, not add spectacle.

- Use 120–180 ms colour, opacity, or small transform transitions for local feedback.
- Avoid large page slides, parallax, spring-heavy cards, looping status animation, and animated number counts.
- Never delay urgent information for animation.
- Respect `prefers-reduced-motion` by removing non-essential transition and animation.

## 13. Content style

Use plain operational language and define screen names on first use.

Preferred:

- **Ready for check-in**
- **Awaiting inspection**
- **Departure due**
- **Guest access unavailable**
- **Payments recorded today**
- **Void mistaken entry**

Avoid:

- vague labels such as **Available** when maintenance or inspection can still block assignment;
- **Checkout complete** before reception confirms actual departure;
- **Revenue** for a lightweight payment record;
- **Cleaning in progress** without tracked housekeeper workflow;
- blame-oriented or technical errors such as **Invalid state transition**.

Use Nigerian naira formatting consistently, for example `₦60,000`, and show dates with unambiguous month names where space allows.

## 14. Accessibility requirements

- Meet WCAG 2.2 AA as the production target.
- Provide a skip link and semantic landmarks.
- Maintain a logical heading order.
- Give every control a programmatic name.
- Use a visible focus ring at least three CSS pixels thick with adequate contrast.
- Announce important async success, errors, and cross-session changes through appropriate live regions without excessive interruption.
- Associate errors with fields and preserve entered values after validation failure.
- Ensure status, charts, and badges remain understandable without colour.
- Support keyboard operation for filters, tables, dialogs, and all actions.
- Restore focus after modal close and manage focus when content updates.
- Test zoom to 200 percent and text spacing overrides.
- Provide reduced motion and avoid hover-only information.

## 15. Design validation checklist

Before approving a production screen:

1. Can each role identify its primary task in five seconds?
2. Can reception tell why a room is not eligible without relying on colour?
3. Are occupancy, inspection, and maintenance shown as separate facts?
4. Are room numbers naturally ordered and easy to scan?
5. Is there only one dominant action per view or dialog?
6. Are destructive and history-changing consequences explicit?
7. Do all controls work by keyboard with visible focus?
8. Does the layout work at 1440, 768, and 390 pixels and on a short-height screen?
9. Does text remain readable at 200 percent zoom?
10. Are empty, loading, error, conflict, offline, and success states designed?
11. Does reduced motion remove non-essential animation?
12. Does the design still feel recognizably sage, rose, tan, beige, and brown?

## 16. Decisions still needed

- Final logo and whether **Hotel Operations** is the product name or a working label.
- Whether the production typography stays system-based or uses packaged brand fonts.
- Final status labels after the room-state model is approved.
- Exact Owner or Manager navigation and operational permissions.
- Density preference after testing on actual reception and supervisor devices.
- Whether a dark mode is needed; it is not part of the initial direction.
- Formal contrast validation of every semantic token and component state.

Until those decisions are made, preserve the palette and interaction principles without presenting the prototype as the final visual system.
