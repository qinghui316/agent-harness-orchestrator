---
name: {{SKILL_NAME}}
description: "Operate the local Harness for {{PROJECT_NAME}}. Use for project knowledge, ECL Change evidence, contract checks, Integration evidence, or Harness Evolution."
---

# {{PROJECT_NAME}} Harness

Use this project Harness when the current project id is `{{PROJECT_ID}}`. Its persisted collaboration
mode is `{{MODE}}`; this value is diagnostic metadata and does not assign Agents, Lanes, or worktrees.

AHO Runtime is the only execution owner for multi-Agent coordination, WorkflowGraph and AgentTask
scheduling, Lane state, worktree allocation and cleanup, validation execution, Apply, Close, and
Integration. This Skill supplies project knowledge, accepted Change scope, contracts, rules, and
durable evidence semantics. It does not orchestrate parallel development.

## Start

1. Read `references/rules/critical.md` and `references/project_wiki/overview.md`.
2. Use the generated `references/project_wiki/catalog.md` to select relevant L2/L3 current,
   target, decision, or guide documents by module and Owner. Follow linked reference-source maps
   only when the task crosses those boundaries.
3. For explanation, navigation, or read-only source research, continue from project knowledge and
   cited implementation evidence without running Registry commands.
4. Classify the user goal as Small or Structured. One Structured user goal maps to exactly one
   Change. Runtime may decompose that Change into multiple AgentTasks and assigned worktrees, but a
   Workflow child never creates a child Change.
5. Read the current workflow and `references/rules/by-stage/<stage>.md` before making that stage's
   decisions.

If the detected project id differs, stop and locate the correct project Harness.

## Classify Work

- **Small:** local, low-risk explanation, navigation, research, or mutation without contract,
  architecture, cross-module, release, permission, data, or multi-step validation impact.
- **Structured:** Runtime creates one Change for the user goal, publishes scope and high-impact
  contracts, and supplies the accepted Change identity to every participating Agent.

Main, Planning, Coder, Rework, Auditor, and Spec-Test Agents consume the Change, graph, task, and
worktree identities supplied by Runtime. Internal Workers read the complete project knowledge and
current accepted Change, modify only their assigned checkout and scope when authorized, and return
results. They never create a Change or Lane, allocate or remove a worktree, run Registry preflight,
or execute Apply, Close, or Integration lifecycle commands.

## Runtime Lifecycle Interfaces

These interfaces document canonical evidence and troubleshooting boundaries. A model Worker must
not invoke them to advance lifecycle state; AHO Runtime calls them through its authorized owners.

```text
{{PROJECT_COMMAND}} audit|doctor --project-root <path>
{{CHANGE_COMMAND}} new|preflight|publish|status|park|resume|close|search|context|reindex --project-root <path>
{{INTEGRATE_COMMAND}} start|status|complete|abort --project-root <path>
{{EVOLVE_COMMAND}} check|status|stage|mark-complete --project-root <path>
{{KNOWLEDGE_COMMAND}} scan|check --project-root <path>
```

For ordinary current, target, decision, guide, workflow, or rule documentation, read the knowledge
model, update the Markdown directly in the current Structured Change, and let `change reindex` or
`change close` refresh the generated catalog and fingerprint baseline. Use
`references/analysis-contract.md` only for a semantic audit or full migration. E1 follows
`references/workflows/evolve.md`; Agent review expands scope when catalog neighbors reveal an
overlap, while Runtime only validates metadata, links, fingerprints, and exact conflicts. Use
`references/bootstrap/project.md` only for an approved empty-project bootstrap Change. Read
`references/runtime-modules.md` only to maintain a helper or diagnose a traceback. Read the
Integration workflow when interpreting Runtime-produced candidate, landing, or worktree cleanup
evidence.

Read `references/git-collaboration.md` only when creating, sharing, cloning, updating, reviewing, or
diagnosing an independent Git repository for this project Skill. Ordinary project work does not load
or run that Git workflow.

Runtime reruns preflight after material path, contract, or baseline changes, before closing
Structured work, and before Integration. Knowledge scan/check is read-only evidence for suspected
drift, a related preflight signal, audit, migration, or E1.

## Stage Route

| Stage | Reference |
| --- | --- |
| Intake | `references/workflows/intake.md` |
| Locate | `references/workflows/locate.md` |
| Plan | `references/workflows/plan.md` |
| Implement | `references/workflows/implement.md` |
| Verify | `references/workflows/verify.md` |
| Close | `references/workflows/close.md` |
| Integrate | `references/workflows/integrate.md` |
| Evolve | `references/workflows/evolve.md` |
| Bootstrap an empty business project | `references/workflows/bootstrap-project.md` |

## Current Evidence

When sources disagree, use this order:

```text
Registry baseline events and contracts
-> current Change evidence
-> repository code, manifests, configuration, tests, and accepted interfaces
-> periodic L1/L2/L3 project knowledge
```

Related drift returns `refresh-needed`; revise the Change before continuing. `state/changes/` owns
complete Change evidence and history. Registry records coordinate Lanes but do not replace the
accepted spec or plan.

## Integration And Evolution

Integration applies selected exact completion ranges. The user confirms I2 only after aggregate
validation and candidate-bound independent review.

Every fifth eligible Change creates an Evolution window. During E1, default to a focused update of
Agent-owned project documents, affected rules, workflows, templates, checks, helpers, or routes.
Search related catalog Owners before creating knowledge and explain why Merge or Replace is not
appropriate. Build a complete semantic rescan only when renderer-owned current facts or
architecture changed. A candidate applies only when its bound Judge report and validation satisfy
`references/audit-rubric.json`; there is no E2.

## Rule Source

`references/rules/red_lines.yaml` is the machine rule source. `critical.md` and `by-stage/` are
generated views. Workflows list applicable rule IDs without duplicating rule text.
