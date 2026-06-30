# Review: workbench-chat-only-center-orchestration-top-tool-v1

Status: approved.

## Findings

No blocking findings.

## Verification

- `npx vitest run tests/unit/web-app.test.tsx` - passed, 87 tests.
- `npx vitest run tests/unit/workbench-server.test.ts tests/unit/workbench-read-model.test.ts` - passed, 63 tests.
- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm run test:fast` - passed, 649 tests.
- `npm run build` - passed. Vite reported the existing large chunk warning only.
- `npm run test:workbench` - passed, 140 tests.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1` - passed after updating current active-change pointers.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1` - passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check` - generated `harness/evolution/pending.md`; this change does not handle that pending evolution.

Selected verification scope: Workbench shell/UI, server/read-model compatibility, fast product regression, Workbench aggregate unit gate, build, lint, and Harness checks.

## Complexity Deletion Review

- Complexity deletion review applicable: yes.
- delete: removed active-conversation center tabs as a visible UI concept.
- reuse: reused `AgentRunGraphPanel`, `AgentOrchestrationMap`, existing transcript paging/virtualization, `ClarificationCard`, `WorkpadDiagnosticDetails`, right rail confirmation, and terminal top-tool button styling.
- yagni: avoided a second graph renderer, right-rail graph view, bottom-dock graph, new projection source, or new workflow action path.
- shrink: the center workspace now defaults to one primary conversation body; Workpad-only details are behind a single low-noise disclosure.
- net: UI surface is smaller while real clarification and evidence/detail reachability remains.

## Acceptance Feedback

- Real/manual acceptance performed: yes.
- Real Codex acceptance claimed: no.
- Manual config edits: none.
- Extra prompts or reviewer instructions: none.
- Retries or environment failures: first screenshot topic used a PowerShell-created Chinese request and displayed question marks because of console encoding; a second ASCII acceptance topic was created for clean visual evidence.
- Screenshots / artifacts:
  - `E:\aho-accept\chat-only-center-v1\screenshots\chat-only-center-clean.png`
  - `E:\aho-accept\chat-only-center-v1\screenshots\agent-graph-overlay-clean.png`
- Workbench URL: `http://127.0.0.1:4462/?project=src&topic=chat-only-overlay-check`.
- External source/state safety: acceptance used independent temporary source `E:\aho-accept\chat-only-center-v1\src` and temporary home `E:\aho-accept\chat-only-center-v1\home`; no AHO repo source apply/close/scheduler/remote/merge/PR/Harness evolution action was triggered.
- Product-fixable workarounds or follow-up evidence: none for this scope.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked: `AGENTS.md`, `docs/STATUS.md`.
- Change made: active-change pointer only, required by ECL lint.
- Archive-ledger content promoted / retained / merged / retired / archive-only: no archive content promoted.
- Tested with: `scripts/lint-ecl.ps1`.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If not applicable, reason: this is a product UI change, not a Harness evolution or rule/template change. The generated pending evolution is left for a separate explicit evolution change.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- Sampled surface: active topic center, top tool buttons, graph overlay, clarification/detail disclosure, right confirmation rail.
- Visible primary UI backed by implemented workflow paths: right `确认` remains the primary confirmation surface; center conversation no longer duplicates primary Workpad action buttons.
- Authoritative primary-surface alignment checked: confirmation queue remains in right rail; graph overlay is read-only.
- Forbidden visible internal terms/actions checked: no `对话 / 工作台 / Agent 编排图` center tabs; no fake apply/close/scheduler/remote/merge/PR controls added.
- Duplicate primary action / in-flight suppression check: Workpad result review moved behind conversation details; right rail remains authoritative.
- Real App DOM / browser UI verification result: independent browser acceptance confirmed center is chat-only and graph opens as overlay.
- Tested with: `tests/unit/web-app.test.tsx`, real UI screenshots listed above.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- Reference map section inspected: current `desktop-cc-gui` reference direction for chat-first center plus top/dock tools, as captured in project docs and prior reference map.
- Controls adapted: top tool placement/alignment pattern, overlay-like large graph surface, compact conversation-first center.
- Intentionally omitted: no editable workflow builder, no right-rail graph, no new terminal/diagnostic behavior, no reference authority model.
- Fake-control check: no unimplemented Browser, PR, remote, merge, Git write, or scheduler controls added.
- Tested with: DOM tests and real UI acceptance.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: yes.
- Checked target ids: `chooseRun` and evidence context now open graph overlay and select the target instead of switching center tabs.
- Tested action path: `tests/unit/web-app.test.tsx` covers graph overlay opening and existing Workbench actions.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: yes.
- Canonical transcript projection checked: no backend projection changes.
- Assistant markdown source checked: no renderer source change.
- Process/tool row compactness checked: unchanged.
- Derived workflow summary exclusion checked: Workpad review content is not injected into visible transcript by default; it is behind a detail disclosure.
- Tested with: `tests/unit/web-app.test.tsx`, `tests/unit/workbench-read-model.test.ts`.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: frontend Workbench shell/panels.
- Moved responsibilities: visible active-topic tabs removed from `ConversationPanel`; orchestration graph exposed through a facade export and top-tool overlay in `App`.
- Retained facade responsibilities: `WorkbenchPanels.tsx` remains the frontend panel export facade; boundary test was updated by preserving the original main export line and separately exporting `AgentRunGraphPanel`.
- Boundary tests or lint checks: `tests/unit/workbench-module-boundaries.test.ts`, `npm run lint`.
- Compatibility result: URL and old center-tab compatibility safely degrade or open overlay without blank center views.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`.
- Stale active-path / phase grep: covered by `lint-ecl`.
- Pending evolution state checked: `harness/evolution/pending.md` exists and is intentionally not handled by this product change.
