# Phase 12U Product Maintenance Canonical Patch Target Descriptors

## Purpose

Phase 12U evolves product-maintenance canonical patch proposals so they can carry
deterministic target descriptors when upstream maintenance evidence provides an
explicit safe target and concrete patch payload. This closes the evidence gap
identified by Phase 12T application manifests without adding a writer or apply
action.

The change keeps canonical patch application readiness as non-executing evidence:
ready manifests may prove that a future writer has enough target metadata, but
they do not authorize canonical docs, stable memory, source files, Workbench
actions, Apply gates, Close gates, or Harness evolution.

## Scope

In scope:

- Optional target hints on maintenance candidates, resolutions, and canonical
  update summaries.
- Optional patch drafts on docs-drift closeout candidates.
- A focused target-descriptor builder that resolves safe relative paths under
  `ResolvedMemory.memoryRoot`, computes SHA-256 expected content hashes, and
  emits descriptors only for concrete patch payloads.
- Canonical patch proposal operations attach descriptors only when target kind,
  target path, current file content, and patch payload are all valid.
- Tests for ready descriptors, blocked no-payload paths, unsafe path rejection,
  old-artifact compatibility, SHA-256 value/shape, Workbench read-model honesty,
  and no file mutation.

Out of scope:

- No deterministic writer.
- No automatic canonical docs or stable-memory rewrite.
- No Workbench apply action or source mutation.
- No bypass of ToolPolicyGate, stale revalidation, Validation, Audit,
  IntegrationCheck, human apply gates, human close gates, or Harness evolution
  gates.
- No broad documentation cleanup beyond required active/closed handoff updates.

## Current Status

Completed.

Pre-implementation plan review completed by subagent `019edb5f-9332-75e0-b9d6-c4b0f948699f`
with PASS. Required amendments were incorporated: optional backward-compatible
fields, real root/symlink path checks, real SHA-256, target-kind consistency,
strict concrete payload rules, non-authorizing readiness semantics, and
read-model/no-mutation coverage.

## Verification

- PASS: `npm run typecheck`
- PASS: `npm run lint`
- PASS: `npm run test:fast -- tests/unit/agent-task-boundaries.test.ts`
- PASS: `npm run test:fast`
- PASS: `npx vitest run tests/unit/workbench.test.ts --testNamePattern "maintenance|canonical patch|application manifest"`
- PASS: `npm run build`
- PASS: `npm run test:integration`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- PASS: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`
- LIMITATION: full `npm run test:workbench` was attempted twice and timed out
  before returning assertions in this environment. The maintenance/canonical patch
  Workbench subset passed.
- REVIEW-FIX: duplicate docs-drift fingerprints now include patch draft content
  so old no-payload drift cannot suppress later concrete patch evidence.
- REVIEW-FIX: target safety tests now cover missing files, directory targets,
  mismatched target kind, `..` path rejection, and symlink escape when symlinks
  are supported by the environment.
- CLOSE-READY REVIEW: second subagent review found no implementation blockers;
  handoff-only findings were addressed in `docs/STATUS.md` and
  `reviews/review.md`.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: limited to required active/closed handoff updates.
- Experience lifecycle result: not an auto-evolve change; no broad history
  cleanup in scope.
- Roadmap/current-direction stale language check: required for `docs/STATUS.md`,
  `AGENTS.md`, and `docs/CURRENT-DEVELOPMENT-PLAN.md` if close changes the next
  recommended product-maintenance track.
- Old experience retained / merged / retired / archive-only: Phase 12T/12R
  details remain archive-only unless directly needed for current routing.
