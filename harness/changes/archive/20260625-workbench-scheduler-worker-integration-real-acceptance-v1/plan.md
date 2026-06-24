# Plan: workbench-scheduler-worker-integration-real-acceptance-v1

## Approach

Use the current product build as the system under test, create a small real
external TypeScript project on E drive, install dependencies there, and drive
Workbench through the browser UI. Prefer no product code changes; if a real
blocker appears, classify it and patch only the responsible owner.

## Steps

1. Create active change records and run preflight/build checks.
2. Prepare `E:\aho-accept\scheduler-worker-v1\src` as a small git-backed
   TypeScript project with `src/alpha.ts`, `src/beta.ts`, package scripts, and
   installed dependencies.
3. Start Workbench with `E:\aho-accept\scheduler-worker-v1\home` as AHO runtime
   state and the E-drive source as the managed project.
4. Use browser UI to submit a low-conflict demand for independent edits to
   `src/alpha.ts` and `src/beta.ts`.
5. Confirm planning/decomposition/readiness manually, then choose
   `完全访问权限` once at the supported scheduler gate.
6. Observe whether automation reaches scheduler worker code, worker
   validation/audit, and integration evidence.
7. If a product bug appears, patch the narrow owner, run targeted tests, rebuild,
   and rerun only the needed real UI segment.
8. Record run ids, artifacts, UI snapshot/DOM summary, source cleanliness,
   verification, and close/handoff docs.

## Decisions

- Dependency preparation is acceptance setup and remains outside AHO product
  automation.
- `完全访问权限` continues to use the existing scoped automation and controlled
  scheduler path; it must not directly consume raw scheduler actions.
- A failed run still counts as valid acceptance when the blocker is classified
  and backed by artifacts.

## Module Boundary Plan

- Owner module: existing scheduler runtime, automation runtime, Workbench action
  handlers, action revalidation, or Workbench projection owners only if a bug is
  found.
- New / moved responsibilities: none planned.
- Facade touch points: avoid adding main logic to broad facades such as
  `src/workbench/chat.ts`, `src/workbench/manager.ts`,
  `src/server/workbench-server.ts`, or `src/web/src/App.tsx`.
- Forbidden write-back locations: no new scheduler/automation logic in broad
  compatibility facades.
- Compatibility surface: no action id, route, artifact schema, or UI contract
  change unless a product bug requires a targeted fix.
- Boundary tests: targeted owner tests only if product code changes.
- Follow-up split candidates: none.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: external-local runtime home,
  Workbench confirmation queue, scoped automation, Goal Loop packet/controller/
  preflight evidence, controlled scheduler advance, worktree dependency bridge,
  worker run artifacts, validation/audit, IntegrationCheck, and source safety
  gates.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism is planned.
- Domain-specific logic location: existing scheduler / automation / Workbench
  owners if repair is required.
- Shared cross-cutting logic location: existing target revalidation,
  ToolPolicyGate, artifact repositories, and source safety gates.
- Local framework / state machine / projection / validation / gate avoided: no
  second scheduler executor, permission system, projection system, or evidence
  protocol.
- Future-cost reduction for similar features: acceptance should identify the
  next concrete scheduler worker/integration gap before any wider loop design.

## Planning-Discovered Gaps

- The previous run stopped because the external source lacked `node_modules`.
  This change removes that environment blocker before testing the next product
  boundary.
