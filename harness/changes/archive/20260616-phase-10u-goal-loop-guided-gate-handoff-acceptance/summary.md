# Phase 10U Goal Loop Guided Gate Handoff Acceptance

## Purpose

Phase 10U hardens the main-Agent handoff from Goal Loop controller policy to the current concrete Harness gate. After Phase 10T proved that fresh controller policy evidence can enter `chat.ask` / `orchestrator.plan` prompt artifacts, this phase makes the prompt context explicitly explain the matching current gate as a guided handoff: the main Agent may describe the safe next gate, but it must not treat that explanation as confirmation or execution authority.

This is an acceptance and prompt-boundary phase. It does not add actions, routes, CLI commands, UI controls, scheduler execution, source mutation, child Changes, or workflow-truth authority.

## Scope

In scope:

- Fix post-handoff docs drift and record Phase 10U as active.
- Add an owned `goal-loop` main-Agent context rendering section for the current matching Harness gate when a fresh `GoalLoopControllerPolicy` recommends the existing gate.
- Record enough run-event evidence for `chat.ask` / `orchestrator.plan` artifacts to prove the guided gate handoff matched the Workpad-visible gate.
- Add focused acceptance coverage for fresh, matching and stale/mismatched controller policy prompt contexts.

Out of scope:

- No new Workbench action, HTTP route, CLI command, UI/lazy projection, scheduler loop, worker start, validation/audit/IntegrationCheck execution, apply/close, child Change, source mutation, or worker prompt injection.
- No change to `GoalLoopDecision`, packet, feedback, controller-policy generation semantics, or confirmation queue authority.
- No broad module split or facade refactor.

## Current Status

Ready to close.

## Verification

Passed:

- `npm run test -- tests/unit/workbench.test.ts -t "records visible goal loop controller policy"`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Drift checks:

- `rg "Phase 10T is active|Current active phase: Phase 10T|harness/changes/active/phase-10t" AGENTS.md docs` returned no matches.
- `rg "Phase 10U|guided gate|Concrete Harness Gate Handoff|Goal Loop Guided" AGENTS.md docs harness/changes/active` found the expected active Phase 10U references.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

Two independent subagent reviews were used before close:

- Code/boundary review found no execution-boundary bug and confirmed `src/goal-loop/*` owns the main implementation.
- Docs/ECL review found close-readiness gaps and Runtime Bridge coverage misclassification; both were fixed before final verification.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable; `AGENTS.md` is 141 lines and `docs/STATUS.md` is 97 lines after updates.
- Experience lifecycle result: not applicable; no Harness evolution or durable rule/template change.
- Roadmap/current-direction stale language check: applicable; stale Phase 7F and IntegrationCheck deferred wording was updated.
- Old experience retained / merged / retired / archive-only: archive-only for the detailed Phase 10U implementation narrative; current docs keep only the behavior-changing handoff and boundary statements.

