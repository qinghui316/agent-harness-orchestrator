# Phase 12T Product Maintenance Canonical Patch Application Manifest

## Purpose

Add a deterministic, non-executing canonical patch application manifest for product maintenance. The manifest will bind a human-gated patch application record to its patch proposal, validate lineage, and report whether the patch has enough concrete target descriptors for a future deterministic writer.

This phase intentionally stops before applying patches. Current Phase 12R patch operations do not include target paths, expected hashes, replacement text, or hunks, so generated manifests should fail closed as `blocked-needs-concrete-targets`.

## Scope

In scope:

- Typed manifest/readiness contract and schemas.
- Dedicated agent-task owner module for manifest artifacts, markdown, reads/lists, and idempotent ledger entry.
- Maintenance candidate filtering for manifest ledger events.
- Read-only Workbench maintenance projection fields.
- Unit and Harness verification.
- Minimal current handoff/status doc updates for this active phase.

Out of scope:

- Deterministic patch writer or file mutation.
- Workbench apply/action handlers.
- Stable memory, canonical docs, source root, Harness template, ECL, apply/close, remote, or Harness evolution mutation.
- Broad documentation cleanup unrelated to this phase.

## Current Status

Completed.

Implementation was completed, verified, independently reviewed, and archived on 2026-06-18.

## Verification

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- --run tests/unit/agent-task-boundaries.test.ts` - passed.
- `npx vitest run tests/unit/workbench.test.ts -t "records terminal demand closeouts"` - passed.
- `npm run test:fast` - passed.
- `npm run build` - passed.
- `npm run test:integration` - passed.
- `npm run test:workbench` - passed; full Workbench suite completed in 500.26s after an earlier parallel run timed out.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status` - passed; close ready.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - passed; no pending evolution.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: user explicitly allowed this run to update directly relevant stale docs, but future runs should not fold broad documentation cleanup into a single execution by default.
- Retries or environment failures: a parallel `npm run test:workbench` attempt timed out after 6 minutes; a subsequent standalone full `npm run test:workbench` completed successfully.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to active/handoff state only.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: `AGENTS.md`, `docs/STATUS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` updated only for Phase 12T handoff/current-direction state.
- Old experience retained / merged / retired / archive-only: not applicable.
