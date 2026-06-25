# Workbench Scheduler Integration Apply/Discard Real Acceptance V1

## Purpose

Validate and minimally harden the existing scheduler IntegrationCheck final human decision. When an IntegrationCheck has passed and the Workbench shows the real apply/discard gate, a human-confirmed apply must safely mutate the source root, while a human-confirmed discard must leave the source root unchanged.

This change does not add a workflow runtime. Open Dynamic Workflows was reviewed as reference evidence for future deterministic workflow artifacts, bounded leaf agents, journal/resume, and pipeline/barrier semantics, but this slice only strengthens the existing IntegrationCheck apply/discard owner.

## Scope

In scope:

- Add handler-level fail-closed guard for stale or terminal `discardIntegrationCheck` requests.
- Preserve existing `applyIntegrationCheck` source safety and artifact freshness guards.
- Verify Workbench surfaces keep integration apply/discard as human gates, outside `完全访问权限`.
- Run E-drive real UI acceptance for apply and discard branches, or record a precise blocker.

Out of scope:

- Full workflow runtime, scheduler loop, parallel executor, slot allocator, child Change creation.
- Automatic apply, discard, close, merge, remote landing, or Harness evolution.
- Moving raw `planning.scheduler.*` actions into the scoped automation allowlist.
- Planning honesty / decomposition scope fixes.

## Current Status

Completed / Ready to close.

## Verification

- `npx vitest run tests/unit/integration-check-apply-discard.test.ts` passed.
- `npx vitest run tests/unit/integration-check-apply-discard.test.ts tests/unit/workbench-read-model.test.ts tests/unit/web-app.test.tsx` passed: 3 files, 86 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run test:fast` passed: 51 files, 528 tests.
- `npm run build` passed.
- `npm run test:workbench` passed: 9 files, 123 tests.

## Acceptance Feedback

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures:
  - `E:\aho-accept\scheduler-apply-discard-v1` was created as a fresh E-drive sandbox. The ordinary demand was routed by readiness to direct single-change `code.run`, not scheduler IntegrationCheck, then hit an accepted-criteria conflict: persistent test coverage was requested while test edits were forbidden. Scoped automation correctly did not expose apply while audit was blocked, and source root stayed clean.
  - Existing `E:\aho-accept\scheduler-integrationcheck-v1g` contains a passed IntegrationCheck (`apply-check-20260624205104-80da3aab`) with aggregate validation `passed`, aggregate audit `approved`, and external source clean, but reopening it through Workbench UI showed the project as Harness-uninitialized / memory `unknown`; the old conversation/gate projection could not be restored for browser apply/discard acceptance.
- Screenshots / artifacts / run ids:
  - Fresh ordinary-path run ids: `run-20260625-102745-src-alpha-ts-alphaready-string-alpha-ready-sr-4cb834` (`coder-codex`, worktree), `run-20260625-103010-src-alpha-ts-alphaready-string-alpha-ready-sr-34991e` (validator), `run-20260625-103014-src-alpha-ts-alphaready-string-alpha-ready-sr-8980eb` (auditor), `run-20260625-103034-src-alpha-ts-alphaready-string-alpha-ready-sr-7488e4` (bounded rework attempt).
  - Existing IntegrationCheck evidence: `E:\aho-accept\scheduler-integrationcheck-v1g\home\projects\scheduler-integrationcheck-v1g\workbench\integration-checks\apply-check-20260624205104-80da3aab\integration-check.json`.
- External source/state safety:
  - `E:\aho-accept\scheduler-apply-discard-v1\src`: clean before source apply; no automatic apply occurred.
  - `E:\aho-accept\scheduler-integrationcheck-v1g\src`: clean while inspecting passed IntegrationCheck evidence.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence:
  - Product code fix completed in `src/integration-check/apply-discard.ts`: `discardIntegrationCheck` now fails closed for terminal or non-discardable IntegrationCheck statuses.
  - Follow-up candidate: Workbench should be able to restore external-local memory/conversation projections from an existing `AHO_HOME` and source marker when a prior acceptance sandbox is reopened. That is separate from IntegrationCheck apply/discard handler safety.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: handoff docs updated only to latest archive/current baseline during closeout.
- Experience lifecycle result: not applicable; this is not Harness evolution.
- Roadmap/current-direction stale language check: performed during closeout.
- Old experience retained / merged / retired / archive-only: Open Dynamic Workflows remains reference evidence only for future workflow runtime work.
