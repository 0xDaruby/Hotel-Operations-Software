# Isolated UI validation

Run `pnpm test:ui` from the repository root. For a manual preview, run `pnpm test:ui:preview` and open the loopback URL it prints. Stop that preview with Ctrl+C.

## Runtime prerequisites

This runner uses Node.js, the workspace's installed `tsx`/esbuild and PGlite, **Playwright 1.62.1**, and installed **Microsoft Edge on Windows** (`channel: 'msedge'`). Playwright is a test-tool prerequisite, not a production application dependency. A fresh `pnpm install` alone does not install this optional browser tool.

Either install the tested version locally with `pnpm add -Dw playwright@1.62.1`, or point the runner to an already-installed trusted Playwright package:

```powershell
$env:PLAYWRIGHT_MODULE_PATH = 'C:\path\to\node_modules\playwright'
pnpm test:ui
```

The verification report records the actual version used. Other browser channels and operating systems are not currently claimed as tested. On a managed Windows sandbox, Edge may need the runner's ordinary external-process approval to create its temporary browser profile.

## What is real and what is replaced

- Production React components, CSS, inspection/maintenance/arrival action adapters, domain summary helpers, SQL migrations, row policies and mutation functions are executed.
- A new **in-memory PGlite database** is created for each run. Synthetic users, rooms, inspections and maintenance issues are seeded there. The fixture never loads `.env`, reads hotel credentials, sends email, or contacts Supabase.
- Next routing/revalidation and the Supabase transport are replaced by test-only adapters to a loopback server. SQL RPC calls still execute the repository's actual functions under transaction-local synthetic staff identities.
- The browser blocks requests outside the fixture origin. The server binds only to `127.0.0.1`; known RPCs and lookups are explicitly allowlisted. The preview does not provide arbitrary SQL access.
- Two browser pages exercise stale snapshots against one database. This proves stale-version/recovery behaviour; it does not prove independent PostgreSQL connection locking or cloud infrastructure reliability.
- Response-loss tests commit a real fixture mutation before dropping the HTTP response. Retrying must not duplicate stays, payments or audit events.

## Evidence and limits

Results, rendered contrast measurements, failure diagnostics and screenshots are written to `tests/browser/artifacts/ui-validation/`, which is ignored by Git. A failed assertion exits nonzero and records a failure rather than silently skipping the scenario.

The contrast helper checks rendered solid-colour text, input values, placeholders and input boundaries, including selected dialog/error states. It does not certify every icon, graphical element, background image, layered opacity case, browser-native popup or assistive technology.

The 200% test uses CSS content scaling and measures layout/action visibility. It is explicitly not a physical-device test or a browser-chrome zoom test. Real phone keyboards, Safari, hardware touch and operating-system/browser text settings need device evidence.

The persistent review report is `docs/verification/2026-10-19-ui-decisions.md`. Keep its original live-browser checks distinct from this isolated validation.
