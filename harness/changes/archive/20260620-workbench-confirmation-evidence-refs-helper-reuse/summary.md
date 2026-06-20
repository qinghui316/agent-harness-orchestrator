# workbench-confirmation-evidence-refs-helper-reuse

## Purpose

Converge duplicated Workbench confirmation read-model `evidenceRefs: string[]` construction into a small read-model owner helper. Confirmation projections currently repeat `artifact ? [artifact] : []` and `[a, b, c].filter((item): item is string => Boolean(item))` across planning, scheduler, and decision-context confirmation items.

This change is separate from the previous evidence action helper reuse. The previous change owns `WorkbenchDecisionAction` evidence actions; this change owns plain string evidence reference arrays for confirmation queue items.

## Scope

In scope:

- Add `src/workbench/projections/read-model/evidence-refs.ts`.
- Reuse the helper from `confirmation/typed-workflow.ts` and `confirmation/decision-context.ts`.
- Preserve order, missing-value filtering, no-dedupe behavior, and confirmation queue output shape.
- Add focused boundary coverage and drift grep for the targeted repeated patterns.

Out of scope:

- `run-graph.ts` and `thread-stream.ts` structured evidence ref objects.
- Runtime action handlers, server endpoints, human gates, ToolPolicyGate, source apply, remote landing, Goal Loop, Scheduler authority, and reference project runtime behavior.
- Broad refactoring of confirmation queue ordering or scheduler gate semantics.

## Current Status

Ready to close.

## Verification

- `rg -n 'evidenceRefs:\s*[^,\n]+\.artifact\s*\?\s*\[[^\]]+\.artifact\]\s*:\s*\[\]|evidenceRefs:\s*\[[^\]]+\]\.filter\(\(item\): item is string => Boolean\(item\)\)' src\workbench\projections\read-model\confirmation\typed-workflow.ts src\workbench\projections\read-model\confirmation\decision-context.ts` - no matches.
- `npx vitest run tests\unit\workbench-module-boundaries.test.ts` - passed.
- `npx vitest run tests\unit\workbench-read-model.test.ts` - passed.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run build` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1` - pending after active handoff alignment.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: none recorded.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: close-ready subagent review found only handoff alignment and close-marker blockers; code review approved the helper owner and mechanical migration. Handoff files were aligned to the active change before close.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: not applicable.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: not applicable.
- Old experience retained / merged / retired / archive-only: not applicable.
