# Approved production baseline

The approved product baseline is `03-hotel-operations.html`, supported by
`operations-shell.html` and `operations-app.js`.

Production implementation must port the approved interface, responsive behaviour,
roles, page hierarchy, terminology, and operational workflows. Do not redesign or
simplify an approved flow merely because the implementation framework changes.

Replace only prototype infrastructure:

- localStorage becomes authoritative PostgreSQL persistence;
- demo profiles become authenticated staff identities;
- browser-only permission checks become server-enforced authorization;
- client-side state transitions become transactional domain/API operations;
- same-browser synchronization becomes server-driven updates with refetch recovery;
- sample records become controlled development seed data.

The prototype remains a visual and behavioural reference. Product rules in
`prd.md` remain authoritative when implementation details are ambiguous.
