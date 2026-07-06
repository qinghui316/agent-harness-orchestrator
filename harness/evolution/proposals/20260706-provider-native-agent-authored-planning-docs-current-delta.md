# Provider-Native Agent-Authored Planning Window

## Decision

Status: `docs_current_delta`
Eval mode: `subagent_review`
Independent review: subagent Harvey, score `86/100`

This archive window does not require a new ECL rule, template, lint, CI gate,
or product runtime change. Existing ECL / BOUNDARIES / WORKBENCH / RUNTIME
coverage already protects the key authority boundaries:

- provider runtime scope is not Harness Change scope;
- Workbench must not infer child-agent delegation by parsing visible text;
- Codex Plan Mode and runtime user-input requests belong to the planning-agent
  workspace and are not Harness gates;
- execution still goes through `planning.confirm-execution`, target freshness,
  ToolPolicyGate, validation/audit, confirmationQueue, and apply/close owners.

The useful delta is current-document alignment: state plainly that planning
content is provider-native and Agent-authored, while AHO validates, maps,
persists, and gates it. AHO must not invent business goals, acceptance
criteria, task lists, or workflow bodies from raw user demand.

## Candidate Archives

- `harness/changes/archive/20260704-auto-evolve-post-native-codex-plan-mode-window/summary.md`
- `harness/changes/archive/20260704-main-agent-a2a-native-interaction-alignment-v3/summary.md`
- `harness/changes/archive/20260704-native-codex-plan-question-flow-alignment-v1/summary.md`
- `harness/changes/archive/20260705-provider-native-a2a-runtime-alignment-v1/summary.md`
- `harness/changes/archive/20260706-provider-native-agent-authored-planning-v1/summary.md`

## Experience Lifecycle Scan

- Promote: none. The window does not justify new ECL clauses, review-template
  fields, lint rules, CI, or runtime machinery.
- Retain: existing provider-runtime, conversation identity, child-agent
  ownership, native Plan Mode, request-user-input, and Harness gate authority
  boundaries.
- Merge: consolidate the 20260704 / 20260705 / 20260706 lessons into one
  current statement: planning is provider-native / Agent-authored; AHO
  validates, persists, and gates but does not author business content.
- Retire: stale current-doc wording that described deterministic planning
  generation or old latest-slice / pending-evolution state.
- Archive-only: run ids, `127.0.0.1:4477`, `goal-loop-demo-real`, browser
  control failures, detailed DOM scans, local scratch paths, and command logs.

## Applied Delta

- `docs/BOUNDARIES.md`: added the Agent-authored planning boundary.
- `docs/WORKBENCH.md`: clarified that Workbench must not invent plan content
  and should continue planning-agent conversation when a plan is incomplete.
- `docs/CURRENT-DEVELOPMENT-PLAN.md`: updated the latest slice and planning
  capability baseline.
- `docs/STATUS.md`: repaired stale next-resume and pending-evolution wording.
- `AGENTS.md`: aligned the compact current baseline with Agent-authored
  planning.

## Non-Changes

No product code, Workbench UI, provider runtime, Scheduler, IntegrationCheck,
ToolPolicyGate, confirmationQueue, automation allowlist, apply/close, remote,
PR, merge, or Harness evolution runtime behavior changed.
