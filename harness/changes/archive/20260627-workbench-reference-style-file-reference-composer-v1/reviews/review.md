# Review: workbench-reference-style-file-reference-composer-v1

Status: completed / ready to close.

## Findings

No blocking findings.

## Verification

- `npx tsc --noEmit --pretty false`
- `npx vitest run tests/unit/file-references.test.ts tests/unit/workbench-server.test.ts tests/unit/codex.test.ts`
- `npx vitest run tests/unit/web-app.test.tsx`
- `npm run typecheck`
- `npm run lint`
- `npm run test:fast`
- `npm run build`
- `npm run test:workbench`
- Selected verification scope: current-project file search, composer `@file`
  picker/chips, draft-to-topic context migration, per-message context refs,
  Codex prompt context rendering, Workbench shell aggregate.
- Full / aggregate suites run or skipped: `npm run test:fast`,
  `npm run build`, and daily `npm run test:workbench` were run. Slow/release
  scheduler suites were not run because this change does not alter scheduler,
  worktree, apply, close, or Goal Loop execution behavior.
- Rationale for selected scope: V1 is a Workbench composer/runtime-context
  feature. Targeted tests cover the changed owners; aggregate Workbench unit
  suite covers the shell contract.
- If an aggregate Workbench / slow suite exceeded the tool window: record timeout, split suite members run, pass/fail status, and whether the timeout is product failure or verification runtime-cost debt.

## Complexity Deletion Review

- Complexity deletion review applicable: yes for product/code/Harness-template/rule changes; docs-only wording changes may mark this not applicable.
- delete: none.
- reuse: existing Workbench project route owner, topic message thread log,
  TopicComposer/ProjectReadinessHome, Skill mention pattern, Codex chat context,
  and Workbench server router.
- yagni: avoided central file index database, file tree panel, attachment
  system, contenteditable rewrite, provider/model controls, workflow runtime,
  permission system, and new Harness artifact family.
- shrink: V1 keeps a thin textarea picker/chip parser and stores only scoped
  message context refs; full file content injection and sticky/pinned context
  were rejected.
- net: Lean already.
- Note: this is supplemental and does not replace correctness, security, source safety, validation/audit, stale-target, ToolPolicyGate, human-gate, or required coverage checks.

## Acceptance Feedback

- Real/manual acceptance performed: no.
- Real Codex acceptance claimed: no.
- If real Codex acceptance is claimed, fake Codex / mocked PATH / fixture result / hand-written artifact exclusion evidence: not applicable.
- Manual config edits: none recorded.
- Extra prompts or reviewer instructions: none recorded.
- Retries or environment failures: DOM tests were adjusted to wait for the
  debounced file search result before clicking; lint retry fixed an unused mock
  parameter.
- Screenshots / artifacts / run ids: none recorded.
- External source/state safety: not applicable. If real/self acceptance uses a managed source project, record source root, runtime home, whether same-root evidence is negative-only, and before/after `git status --short`.
- Remote handoff acceptance: not applicable.
- Product-fixable workarounds or follow-up evidence: none recorded.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- If applicable, documents checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, before/after line counts: not recorded; updates are compact
  current-state bullets only.
- If applicable, duplicate current-state fields checked: yes.
- If applicable, roadmap/current-direction stale language checked: yes.
- If applicable, archive-ledger content promoted / retained / merged / retired / archive-only: not applicable.
- If applicable, over-budget documents and rationale: not applicable.
- If applicable, tested with: Harness lint/check commands before close.
- If not applicable, reason: not applicable.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: no.
- If applicable, promote decisions: not applicable.
- If applicable, retain decisions: not applicable.
- If applicable, merge decisions: not applicable.
- If applicable, retire decisions: not applicable.
- If applicable, archive-only decisions: not applicable.
- If applicable, noop / no-change rationale after old-experience scan: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change is not an auto-evolve, Harness rule/template, docs, or handoff change.

## Worktree Diff Artifact Coverage

- New-file / untracked worktree diff coverage applicable: no.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect worktree-backed diff behavior.

## Read Model Projection Coverage

- Workbench / GUI read-model projection coverage applicable: yes.
- If applicable, checked scope: composer-created message context refs are
  persisted in topic thread entries and later consumed by Codex context; no
  confirmation projection or Workpad truth changed.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx`,
  `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes.
- If applicable, sampled surface: home composer and topic composer.
- If applicable, visible primary UI backed by implemented workflow paths:
  `@file` picker uses the real selected-project file search API and sends real
  `contextRefs`.
- If applicable, authoritative primary-surface alignment checked across confirmation queue / decision inspector / visible primary card: confirmation queue not changed.
- If applicable, stale-history override and running/archived selected-demand suppression checked: not applicable.
- If applicable, out-of-scope future capability check: no fake file tree,
  attachment, provider/model, marketplace, scheduler, apply/close, or remote
  controls were added.
- If applicable, forbidden visible internal terms/actions checked: tests assert
  composer behavior through user-facing labels; no workflow internals were
  introduced.
- If applicable, duplicate primary action / in-flight suppression check: not
  changed.
- If applicable, high-impact action path result: no apply/close/scheduler/remote
  action path changed.
- If applicable, real App DOM / browser UI verification result when the behavior is product-visible: DOM tests cover visible picker/chip/send flow.
- If applicable, projection/unit evidence that supplements but does not replace visible-surface acceptance: `file-references`, server, Codex context, and Workbench aggregate tests.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx`,
  `npm run test:workbench`.
- If not applicable, reason: not applicable.

## Reference-Driven UI / Product Source Evidence Coverage

- Reference-driven UI/product coverage applicable: yes.
- If applicable, reference map section inspected:
  `docs/design-docs/ref-desktop-cc-gui.md` composer/files capability sections.
- If applicable, reference source files or inspected commit used:
  `reference-projects/desktop-cc-gui/src/features/composer/components/ChatInputBox/providers/fileReferenceProvider.ts`,
  `.../hooks/useFileTags.ts`,
  `.../utils/composerFileReferences.ts`,
  `.../components/Composer.tsx`.
- If applicable, controls copied / adapted / intentionally omitted: adapted
  `@file` autocomplete, selected chips, and cleaned prompt submission; omitted
  unsupported full file tree, attachments, and generic slash command framework.
- If applicable, fake-control check: no fake attachment/file tree/provider/model
  controls were added.
- If applicable, tested with: `npx vitest run tests/unit/web-app.test.tsx`.
- If not applicable, reason: not applicable.

## Scoped Workbench Action Payload Coverage

- Scoped Workbench action payload coverage applicable: no.
- If applicable, checked target ids: not applicable.
- If applicable, tested action path: not applicable.
- If applicable, duplicate action/evidence affordance and in-flight duplicate submission check: not applicable.
- If not applicable, reason: change does not add or change Workbench live/server UI actions that depend on explicit target ids.

## Transcript Renderer Source-Boundary Coverage

- Transcript renderer source-boundary coverage applicable: no.
- If applicable, canonical transcript projection checked: not applicable.
- If applicable, assistant markdown source checked: not applicable.
- If applicable, process/tool row compactness checked: not applicable.
- If applicable, derived workflow summary exclusion checked: not applicable.
- If applicable, worker/role transcript scoping checked: not applicable.
- If applicable, private chain-of-thought exclusion checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect the default Workbench main conversation transcript or parent-agent transcript projection.

## Source Apply Safety Coverage

- Source apply safety coverage applicable: no.
- If applicable, checked source project / fixture: not applicable.
- If applicable, checked runtime home / external managed-project isolation: not applicable.
- If applicable, checked worktree ids / result ids / integration check ids: not applicable.
- If applicable, source-root mutation gate checked: not applicable.
- If applicable, out-of-scope source mutation check: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect result review, worktrees, apply/discard flows, source refresh rework, integration checks, multi-demand confirmation, or source-root apply handoff.

## Runtime Bridge Boundary Coverage

- Runtime bridge boundary coverage applicable: yes.
- If applicable, checked boundary: Codex context gets referenced relative
  paths/kinds only; AHO does not inject full file contents or execute anything
  because of a file reference.
- If applicable, tested with:
  `npx vitest run tests/unit/file-references.test.ts tests/unit/codex.test.ts`.
- If not applicable, reason: not applicable.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: no.
- If applicable, artifact type and authority classification: not applicable.
- If applicable, boundary matrix checked: not applicable.
- If applicable, out-of-scope execution paths checked: not applicable.
- If applicable, stale/forged target behavior checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not introduce or change planning proposals, decomposition plans, readiness manifests, workflow plans, recovery material, scheduler-readiness artifacts, or similar proposal/runtime boundary artifacts.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: no.
- If applicable, persistent Goal/Change scope checked: not applicable.
- If applicable, recommendation authority checked: not applicable.
- If applicable, fallback priority checked: not applicable.
- If applicable, packet / main-Agent context freshness checked: not applicable.
- If applicable, stale or superseded packet suppression checked: not applicable.
- If applicable, feedback selected Change / packet lineage / visible gate scope checked: not applicable.
- If applicable, feedback remains user evidence, not hidden instruction / arbitrary chat scrape / execution approval: not applicable.
- If applicable, feedback-triggered re-evaluation remains non-executing and primary Harness gate stays separate: not applicable.
- If applicable, hidden execution / source mutation check: not applicable.
- If applicable, ToolPolicyGate / human gate preservation checked: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not add or change GoalLoopDecision policy, goal-loop confirmation surfaces, autonomous loop behavior, or conflict-aware continuation behavior.

## Module Boundary Coverage

- Module boundary coverage applicable: yes.
- Future feature owner module: `src/workbench/file-references.ts` for backend
  search/resolve/render helpers; `src/web/src/shell/FileMentionPicker.tsx` and
  `src/web/src/shell/file-mentions.ts` for composer UI/parser.
- If applicable, module owners checked: Workbench server route delegates to
  file-reference helper; App only binds refs to existing topic/message requests;
  Codex context renders refs.
- If applicable, moved responsibilities: none.
- If applicable, retained facade responsibilities: server router remains a
  thin route layer; App remains orchestration glue.
- If applicable, forbidden write-back locations: no durable memory, Harness
  artifacts, project marker, SQLite schema, or workflow state writes for picker
  UI state.
- If applicable, compatibility surface: existing topic/message requests remain
  compatible; `contextRefs` is optional.
- If applicable, behavior path tested: file search route, home composer, topic
  composer, thread log persistence, Codex context rendering.
- If applicable, follow-up split candidates: not applicable.
- If applicable, boundary tests or lint checks: not applicable.
- If applicable, compatibility result: not applicable.
- If applicable, tested with: targeted Vitest suites plus typecheck/lint/build.
- If not applicable, reason: not applicable.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes.
- If applicable, existing mechanisms reused or strengthened: project-scoped
  Workbench server routes, topic thread log, existing composer surfaces, Codex
  context builder, and reference-style mention/picker pattern from Skills.
- If applicable, new cross-cutting mechanism and owner: only a narrow
  file-reference helper and front-end picker/parser.
- If applicable, why existing mechanisms were insufficient: Skills mention
  parser cannot validate project paths or safe file metadata.
- If applicable, domain-specific logic location: `src/workbench/file-references.ts`.
- If applicable, shared cross-cutting logic location: `src/web/src/shell/file-mentions.ts`.
- If applicable, local framework / state machine / projection / validation / gate avoided: yes; no new runtime, DB, permission, or workflow projection system.
- If applicable, public API / facade / Workbench compatibility result: optional
  `contextRefs` preserves old requests.
- If applicable, future-cost reduction result: future file tree/attachments can
  reuse safe project file lookup and topic context binding.
- If applicable, tested with: targeted suites, `test:fast`, `test:workbench`.
- If not applicable, reason: not applicable.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- If applicable, handoff files checked: `AGENTS.md`, `docs/STATUS.md`,
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- If applicable, stale active-path / phase grep: checked through Harness status
  before close.
- If applicable, latest archive / active path alignment: updated to this change.
- If applicable, pending evolution state checked: yes; no pending evolution at
  start of change.
- If not applicable, reason: not applicable.

## Remote Handoff Acceptance Coverage

- Remote handoff coverage applicable: no.
- If applicable, checked provider/repository/action boundary: not applicable.
- If applicable, tested with: not applicable.
- If not applicable, reason: change does not affect Draft PR creation/update, PR feedback refresh, provider capability detection, remote checks/reviews, or remote handoff evidence.
