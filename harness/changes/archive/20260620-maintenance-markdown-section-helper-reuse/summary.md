# Maintenance Markdown Section Helper Reuse

## Purpose

Converge repeated maintenance Markdown section layout in the canonical update / canonical patch chain into the existing maintenance Markdown owner.

This is Architecture Growth Control work. It reduces repeated local `## Section` layout blocks while preserving artifact schemas, ids, markdown semantics, authority flags, lineage, target validation, artifact refs, ledger events, ToolPolicyGate, human gates, Workbench actions, source mutation behavior, scheduler, Goal Loop, and runtime behavior.

## Scope

In scope:

- Extend `src/agent-task/maintenance-markdown.ts` with a tiny generic section layout helper.
- Reuse that helper from canonical update proposal/decision, canonical patch proposal/application gate, application manifest/result, and application report Markdown renderers.
- Keep domain-specific section contents in the existing canonical modules.
- Add exact output and module-boundary coverage for the helper.

Out of scope:

- New markdown DSL, artifact/report framework, manifest/descriptor/report family, projection system, state machine, validation gate, ledger policy, or runtime protocol.
- Schema, artifact id, artifact object field, authority flag, lineage, target validation, artifact ref, ledger event, ToolPolicyGate, human gate, Workbench action, source mutation, scheduler, Goal Loop, runtime, remote, apply/close, or Harness evolution behavior changes.
- Broad maintenance-chain redesign or unrelated Workbench/scheduler/Goal Loop refactoring.

## Current Status

Ready to close.

Plan passed subagent review `019ee20c-57bd-71d0-9b05-023178af2adc`.

Continuation rationale: this active change is the current structured work item and should continue until implementation, verification, review, and close are complete.

## Verification

Passed:

- `npx eslint src/agent-task/maintenance-markdown.ts src/agent-task/canonical-updates.ts src/agent-task/canonical-patch-application.ts src/agent-task/canonical-patch-application-report.ts tests/unit/agent-task-boundaries.test.ts tests/unit/workbench-module-boundaries.test.ts`
- `npx vitest run tests/unit/agent-task-boundaries.test.ts`
- `npx vitest run tests/unit/workbench-module-boundaries.test.ts`
- `npm run typecheck`
- `npm run lint`
- `rg -n "## " src/agent-task/canonical-updates.ts src/agent-task/canonical-patch-application.ts src/agent-task/canonical-patch-application-report.ts src/agent-task/maintenance-markdown.ts src/agent-task/canonical-patch-application-authority.ts`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`

Not run:

- `npm run test`: targeted unit and module-boundary tests cover the new section helper, its exact output, and the consuming renderers' ownership boundary. This change only moves static Markdown section layout and does not alter runtime, Workbench action behavior, artifact schema/id, lineage, ledger, store, gate, scheduler, Goal Loop, ToolPolicyGate, human gate, or source mutation paths.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.
- Plan review: subagent `019ee20c-57bd-71d0-9b05-023178af2adc` returned PASS for a renderer-only section helper reuse change; constraints are to keep the helper tiny, avoid a markdown DSL/framework, preserve output semantics, and use targeted tests.
- Implementation review: subagent close-ready review `019ee213-2b35-7111-bc70-9c16e1e56089` confirmed implementation checks pass, targeted evidence is sufficient, and `README.md` remains untracked/unincluded. Its only blocking notes were close-ready status text updates, which this final handoff update resolves.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable for active handoff only; no durable rule or roadmap change planned. Current active handoff line counts: `AGENTS.md` 101 lines, `docs/STATUS.md` 109 lines.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
