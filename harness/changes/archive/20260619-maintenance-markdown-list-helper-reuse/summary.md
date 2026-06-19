# maintenance-markdown-list-helper-reuse

## Purpose

Reuse one presentation-only maintenance markdown list helper for repeated reference-list rendering in the canonical patch application result/report chain.

This is an Architecture Growth Control slice. It introduces a narrow owner for maintenance artifact markdown helper behavior while keeping canonical patch result/report modules focused on their domain-specific sections and authority text.

## Scope

In scope:

- Add `src/agent-task/maintenance-markdown.ts` as the owner for presentation-only maintenance markdown helpers.
- Add `renderMaintenanceMarkdownList` for markdown bullet list rendering with an optional empty fallback label.
- Reuse it from the canonical patch application result and observation report markdown renderers for `policyAuditRefs` and `artifactRefs`.
- Add direct helper coverage for non-empty refs, empty refs without fallback, and empty refs with fallback `none`.
- Preserve existing result/report markdown output.

Out of scope:

- No parser, schema, artifact JSON shape, ledger event policy, ledger artifact refs, authority flag, human gate, ToolPolicyGate, source mutation, Workbench, Scheduler, Goal Loop, manager facade, reference source, or broad renderer refactor.
- Other `artifactRefs.map(...)` renderer occurrences are intentionally out of scope for this slice.

## Current Status

Completed and archived. Plan review passed earlier with tightening, implementation is complete, product verification passed, independent close-ready review passed after evidence correction, and close/archive completed.

Continuation rationale: no active continuation remains for this change. Post-close handoff points to this archive, pending Harness evolution was checked, and final git landing is handled outside the archived Change lifecycle.

## Verification

- Targeted renderer grep for old local list rendering found one intentionally out-of-scope manifest renderer at `src\agent-task\canonical-patch-application.ts:522`; the four in-scope result/report `policyAuditRefs` and `artifactRefs` call sites now use `renderMaintenanceMarkdownList`.
- `npm run test:fast -- --run tests/unit/agent-task-boundaries.test.ts` passed: 1 file, 26 tests.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:fast` passed: 29 files, 339 tests.
- `npm run test:integration` passed: 1 file, 38 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-encoding.ps1` passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\lint-ecl.ps1` passed.
- `npm run test:workbench` was not rerun for this slice. It timed out earlier in this same goal run after 184029 ms, and this change does not affect Workbench code, routes, projections, UI actions, or server behavior.

## Acceptance Feedback

Record real/manual acceptance notes when applicable:

- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: `npm run test:workbench` was not rerun because the earlier same-goal attempt timed out after 184029 ms and left residual Node workers that had to be stopped.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy And Experience Lifecycle

- Documentation entropy check: applicable to temporary active handoff updates in `AGENTS.md` and `docs/STATUS.md`; post-close handoff removes active paths and points to this archive.
- Experience lifecycle result: not applicable.
- Roadmap/current-direction stale language check: active handoff remains aligned with `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Old experience retained / merged / retired / archive-only: not applicable.
