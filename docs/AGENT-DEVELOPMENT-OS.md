# Agent Development OS

This document defines AHO's stable product loop. Current priorities are owned only by
`docs/CURRENT-DEVELOPMENT-PLAN.md`; current task state and history are owned by the project Harness.

## Product Loop

```text
User demand
-> clarify and accept observable requirements
-> create or update one bounded Change
-> plan against current architecture and contracts
-> delegate bounded role work when useful
-> collect source, run, validation, and audit evidence
-> rework or ask the user when evidence is stale, conflicting, or incomplete
-> review the exact candidate
-> apply locally under scoped authorization
-> close with exact completion identity
-> optionally prepare a separately confirmed remote landing
```

Simple, local, low-risk work may complete directly. Cross-module, architectural, runtime,
permission, schema, release, or multi-step work uses a structured Change.

## Authority Model

The user conversation is the primary interaction surface, but it is not the workflow database.
Canonical authority remains explicit:

- accepted Spec, Plan, Tasks, and acceptance criteria define the requested Change;
- TaskGraph, WorkflowRun, role-run, validation, audit, worktree, apply, and close artifacts define
  execution evidence;
- Provider sessions and native Goal provide model continuity;
- Workbench, graphs, menus, Agent Office, and status summaries are projections;
- Registry and contracts coordinate current work without replacing accepted Change evidence.

An Agent may propose or perform only the next action allowed by current evidence and policy. It may
not use AHO's product CLI to accept its own proposal, dispatch unauthorized work, apply source,
close a Change, push, create a PR, or merge on the user's behalf.

## Bounded Delegation

Delegation is useful when a task has a clear owner, input, output, path scope, and verification.
Workers receive the smallest sufficient context and cannot widen their own authority. Parallel
work is reserved for independent slices with explicit conflict and dependency evidence. Combined
results require candidate-bound Integration, validation, and review before landing.

## Evidence And Recovery

Every important transition records stable lineage and enough evidence to reproduce or reject it.
Retries do not erase prior attempts. Stale source, changed contracts, missing artifacts, provider
generation changes, or mismatched worktree hashes fail closed and return to planning, rework, or
user input.

Current-state projections must distinguish absence, failure, waiting, and unsupported capability.
They must not fabricate successful execution from optimistic UI state.

## Human Gates

Plan acceptance can authorize bounded local implementation, revalidation, commit, finalize, and
close for that accepted Change. Remote landing, push, PR creation, merge, destructive external
actions, and unclear product decisions remain separately confirmed.

## Project Memory

Managed-project experience is maintained outside ordinary conversation context. Qualified Change
closes feed serial Maintenance and periodic proposal-first Evolution. Repeated current lessons may
be promoted into a rule, workflow, template, check, or knowledge map; one-off narrative remains
Change history. AHO product source and canonical documents still change through normal accepted
Changes.

## Product Boundaries

- AHO is not a generic autonomous multi-agent framework.
- AHO is not a pure chat UI or a project-management clone.
- UI projections do not become workflow truth.
- Provider-native identity does not become project memory or authorization.
- Reference implementations are evidence to adapt, not code or authority to copy.
- Automatic merge, remote landing, and unbounded scheduler execution are outside the default path.
