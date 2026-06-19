# Plan: maintenance-markdown-list-helper-reuse

## Approach

Add a small maintenance markdown helper owner and route the repeated result/report reference-list rendering through it. Keep the helper presentation-only, keep artifact-specific markdown section composition in the existing canonical patch application modules, and preserve output text.

## Steps

1. Add `renderMaintenanceMarkdownList` in `src/agent-task/maintenance-markdown.ts`.
2. Import and reuse it in `src/agent-task/canonical-patch-application.ts` for result `policyAuditRefs` and `artifactRefs`.
3. Import and reuse it in `src/agent-task/canonical-patch-application-report.ts` for report `policyAuditRefs` and `artifactRefs`.
4. Add direct helper coverage in `tests/unit/agent-task-boundaries.test.ts`.
5. Run targeted and broad validation, then independent close-ready review.

## Decisions

- Helper owner: `src/agent-task/maintenance-markdown.ts`, because this is presentation-only maintenance markdown behavior and should not be mixed into artifact storage or generic utilities.
- Helper output: array of markdown lines, so existing renderers can keep their section composition and `join("\n")` behavior.
- Empty fallback: optional `emptyLabel` preserves `- none` for empty policy audit sections without forcing evidence sections to render a placeholder.
- Four-call-site limit: intentionally limited to result/report `policyAuditRefs` and `artifactRefs`; other repeated artifact-ref renderers are future candidates, not missed scope.

## Module Boundary Plan

- Owner module: `src/agent-task/maintenance-markdown.ts`.
- New / moved responsibilities: maintenance artifact markdown bullet-list rendering for simple reference lists.
- Facade touch points: none; `src/agent-task/manager.ts` remains untouched.
- Forbidden write-back locations: Workbench, bridge/runtime adapters, frontend, scheduler modules, Goal Loop modules, manager facades, source apply paths, schema/type definitions, ledger policy modules, and reference-project source.
- Compatibility surface: canonical patch application result/report markdown policy-audit and evidence list output remains unchanged; artifact JSON/schema and ledger refs remain unchanged.
- Boundary tests: direct helper test plus existing result/report markdown tests.
- Follow-up split candidates: broader maintenance renderer adoption for proposal/gate/manifest artifact reference lists.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: maintenance artifact markdown rendering ownership.
- Why existing mechanisms are insufficient if a new mechanism is proposed: artifact storage helpers own JSON/Markdown writes and refs, not presentation line formatting; generic utils would hide the domain owner.
- Domain-specific logic location: canonical patch application result/report modules keep section order, authority text, and operation rendering.
- Shared cross-cutting logic location: maintenance markdown simple reference-list rendering belongs in `src/agent-task/maintenance-markdown.ts`.
- Local framework / state machine / projection / validation / gate avoided: avoids repeated feature-local markdown list formatting and adds no state machine, projection, validation gate, ledger policy, authority protocol, or artifact protocol.
- Future-cost reduction for similar features: later maintenance renderers can reuse the same list helper when they converge evidence/reference sections.
- If not applicable, reason: not applicable.

## Planning-Discovered Gaps

- Subagent plan review passed. Tightening notes: classify this as structured; record exact owner responsibility; direct tests should import the owner module rather than manager facade; record the four-call-site limit as intentional; review must confirm no JSON, schema, ledger ref, authority flag, human-gate application, or source mutation behavior changed.
