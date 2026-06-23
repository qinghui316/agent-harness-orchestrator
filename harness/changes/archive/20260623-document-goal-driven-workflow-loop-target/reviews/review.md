# Review: document-goal-driven-workflow-loop-target

Status: complete.

## Findings

No blocking findings.

## Verification

- Selected verification scope: docs/Harness-only verification, because the
  change updates current roadmap/product/Workbench/design docs and active
  change records without touching product runtime code.
- `rg` drift check for misleading phrases:
  `all TaskGraph nodes enter worktree`, `Scheduler is the product core`,
  `full parallel executor implemented`, `full-auto current capability`, and
  Chinese equivalents. Result: no current capability claim found. The only
  direct "Scheduler is the product core" hit is inside the active change
  summary as an explicitly rejected misunderstanding.
- Current-state grep for active path: `AGENTS.md` and `docs/STATUS.md` both
  point to
  `harness/changes/active/document-goal-driven-workflow-loop-target/`.
- Current-state grep for manual/full-auto boundaries: docs still state the
  current product baseline is manual-gated real local loop acceptance and that
  full-auto / full parallel executor behavior is future-only.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`:
  pass.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`:
  pass, rebuilt `harness/changes/INDEX.json`.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`:
  ran while T-008 was still open; reported expected active-change drift for the
  incomplete verification task, with STATUS alignment true.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`:
  pass; no pending evolution, one archived change since last completion,
  threshold five.
- Initial `scripts/lint-ecl.ps1` result: expected fail while T-008 was still
  open and the summary was not close-ready. It will be rerun after this review,
  T-008 completion, and close-ready summary update.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-ecl.ps1`:
  pass.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/lint-encoding.ps1`:
  pass.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 reindex`:
  pass.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-change.ps1 status`:
  pass; no active change, STATUS aligned.
- Final `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/harness-evolve.ps1 check`:
  pass; no pending evolution.
- Full / aggregate suites run or skipped: skipped. Rationale: no product code,
  runtime behavior, Workbench action payload, validation/audit path, source
  apply path, scheduler runtime, or package script behavior changed.

## Documentation Entropy Coverage

- Documentation entropy coverage applicable: yes.
- Documents checked:
  `AGENTS.md`, `docs/STATUS.md`, `docs/CURRENT-DEVELOPMENT-PLAN.md`,
  `docs/PRODUCT.md`, `docs/AGENT-DEVELOPMENT-OS.md`, `docs/WORKBENCH.md`,
  `docs/design-docs/controlled-scheduler-loop.md`, and this active change.
- Line counts from `HEAD` to current working tree:
  `AGENTS.md` 117 -> 123, `docs/STATUS.md` 89 -> 113,
  `docs/CURRENT-DEVELOPMENT-PLAN.md` 87 -> 189, `docs/PRODUCT.md` 215 -> 228,
  `docs/AGENT-DEVELOPMENT-OS.md` 158 -> 183, `docs/WORKBENCH.md` 230 -> 238,
  `docs/design-docs/controlled-scheduler-loop.md` 100 -> 109.
- Duplicate current-state fields checked: AGENTS/STATUS both name the same
  active change and pending evolution state.
- Roadmap/current-direction stale language checked: current plan now says the
  future direction is Goal-driven Workflow Loop, while the current product
  baseline remains manual-gated real local loop acceptance.
- Archive-ledger content promoted / retained / merged / retired /
  archive-only: promoted the repeated reference lesson into one current target
  model; merged Scheduler/worktree misconceptions into a short boundary;
  retained real-Codex manual loop baseline; left detailed phase history
  archive-only.
- Over-budget documents and rationale: `docs/CURRENT-DEVELOPMENT-PLAN.md`
  grew materially because it now owns the positive target model and diagram;
  this is appropriate for the plan-level doc rather than AGENTS/STATUS.
- Tested with: drift greps and Harness docs checks listed above.

## Experience Lifecycle Coverage

- Experience lifecycle coverage applicable: yes, for docs current-memory
  decisions only; this is not a Harness auto-evolution change.
- Promote decisions: promote the "Goal-driven Workflow Loop, not
  Scheduler-first" model into current plan docs.
- Retain decisions: retain human-gated apply/merge/close and current
  manual-gated real local acceptance baseline.
- Merge decisions: merge scattered reference lessons into one combined model:
  Codex Goal + Loop Engineering + Open Dynamic Workflows + Symphony.
- Retire decisions: retire wording that could imply every TaskGraph node should
  become a worktree job by adding explicit worktree suitability limits.
- Archive-only decisions: detailed historical phase progress remains in
  archived summaries and existing phase history, not copied into handoff docs.

## Proposal / Runtime Boundary Coverage

- Proposal/runtime boundary coverage applicable: yes, documentation-only.
- Artifact type and authority classification: the new target text is roadmap
  guidance, not executable runtime or workflow truth.
- Boundary matrix checked: Goal/Change remains persistent scope; WorkflowGraph
  and WorkflowRun are structure/recovery; Scheduler/worktree is bounded
  execution strategy; ToolPolicyGate and human gates remain authority for
  high-impact transitions.
- Out-of-scope execution paths checked: no full-auto, scheduler loop runtime,
  whole-wave dispatch, slot allocator, child Change auto-creation, or product
  code change.
- Stale/forged target behavior checked: not applicable to docs-only change.
- Tested with: drift greps and docs/Harness lint.

## Goal Loop Boundary Coverage

- Goal Loop boundary coverage applicable: yes, documentation-only.
- Persistent Goal/Change scope checked: current plan now states the main Agent
  loops over persistent Goal/Change evidence.
- Recommendation authority checked: text keeps Goal Loop as evidence-aware
  next-step selection; it does not make recommendations executable authority.
- Low-conflict versus high-conflict routing checked: current plan and Workbench
  docs now distinguish low-conflict worktree slices from sequential, waiting,
  rework, IntegrationFix, and user clarification paths.
- ToolPolicyGate / human gate preservation checked: current plan, product, and
  scheduler design note preserve human apply/merge/close and high-impact gates.
- Tested with: docs review and drift greps.

## Workbench User-Surface Honesty Coverage

- Workbench user-surface honesty coverage applicable: yes, documentation-only.
- Sampled surface: Workbench future loop UX language in `docs/WORKBENCH.md`.
- Result: Workbench text now says the primary surface is current goal,
  evidence, and one real gate; TaskRun, WorkerLease, SchedulerRun, WorkflowRun,
  recovery keys, and queue internals belong in details/evidence/developer docs.
- Product-visible UI tests: not run; no UI code changed.

## Module Boundary Coverage

- Module boundary coverage applicable: no product modules changed.
- Reason: this change adds architecture vocabulary and roadmap guidance only.

## Core Mechanism Reuse Coverage

- Core mechanism reuse / architecture growth control coverage applicable: yes,
  documentation-only.
- Existing mechanisms reused or strengthened: ECL change lifecycle, current
  docs hierarchy, reference maps, ToolPolicy/human-gate boundary vocabulary.
- New cross-cutting mechanism and owner: none.
- Local framework avoided: no new evidence family, runtime layer, summary
  layer, or UI card was added.
- Future-cost reduction result: future agents have one current target model to
  consult before proposing full-auto, Scheduler, or parallel-worktree changes.

## Other Coverage

- Worktree Diff Artifact Coverage: not applicable; no worktree diff behavior
  changed.
- Read Model Projection Coverage: not applicable; no projection code changed.
- Scoped Workbench Action Payload Coverage: not applicable; no action contract
  changed.
- Transcript Renderer Source-Boundary Coverage: not applicable; no transcript
  renderer changed.
- Source Apply Safety Coverage: not applicable; no apply/discard path changed.
- Runtime Bridge Boundary Coverage: not applicable; no runtime bridge changed.
- Remote Handoff Acceptance Coverage: not applicable; no remote handoff changed.

## Close / Handoff Drift Coverage

- Close/handoff drift coverage applicable: yes.
- Handoff files checked: `AGENTS.md`, `docs/STATUS.md`, and
  `docs/CURRENT-DEVELOPMENT-PLAN.md`.
- Stale active-path / phase grep: active path grep confirms AGENTS and STATUS
  pointed at the active docs change before close; final grep confirms no active
  change remains in AGENTS/STATUS and the remaining active-path hits are
  historical evidence inside this archive.
- Latest archive / active path alignment: AGENTS and STATUS now point to
  `harness/changes/archive/20260623-document-goal-driven-workflow-loop-target/summary.md`
  as the latest product/Harness docs change; active change state is none.
- Pending evolution state checked: no pending evolution.
