# Fixed Proposal Format

Write these required files directly in the assigned proposal workspace:

```text
spec.md
plan.md
tasks.md
```

`notes.md` is optional. Return the complete `plan.md` as the final response;
Runtime reads the files and does not reconstruct them from a JSON envelope.

## Spec

Use these headings in order:

```markdown
# Spec: <specific outcome>

## Purpose
## Users
## Acceptance Criteria
## Non-Goals
## Constraints
## Risks
```

Every criterion must use this exact list syntax:

```markdown
- AC-001: <observable and testable result>
- AC-002: <observable and testable result>
```

The `- ` list marker, `AC-` identifier, three or more digits, and colon are
required. Bare lines such as `AC-001: ...` are invalid.

## Plan

Use these headings in order:

```markdown
# Plan: <specific outcome>

## Goal
## Proposed Changes
## Implementation
## Verification
## Risks And Assumptions
## Workflow
```

- `Goal`: two to four sentences describing the result and current gap.
- `Proposed Changes`: behavior or product-area changes, not a file inventory.
- `Implementation`: ordered steps that state what changes, why, and how the
  result will be verified.
- `Verification`: observable outcomes, not only `run tests`.
- `Risks And Assumptions`: only decisions material to user review; write `None`
  when there are none.
- `Workflow`: exactly one fenced `json` block and no prose after it.

The user-readable sections must not depend on reservation ids, run ids, worker
terminology, gates, or other internal orchestration vocabulary.

## Workflow Block

```json
{
  "version": "1.0",
  "mode": "sequential-v1",
  "nodes": [
    {
      "id": "add-health-endpoint",
      "title": "Expose application health through GET /healthz",
      "taskIds": ["T-001"],
      "acIds": ["AC-001", "AC-002"],
      "prompt": "Objective: Add GET /healthz. Required behavior: Return HTTP 200 with {\"status\":\"ok\"} and preserve GET /. Constraints: Stay within the accepted source scopes. Expected evidence: Return changed files and regression-test results for both routes.",
      "dependsOn": [],
      "sourceScopes": ["src/**", "test/**"]
    }
  ]
}
```

Rules:

- `version` is exactly `"1.0"`.
- `mode` is `"sequential-v1"` or `"ready-set-v1"`.
- Node ids are unique stable kebab-case identifiers.
- In v1, `taskIds` contains exactly one existing Task id.
- `acIds` contains one or more existing AC ids.
- `prompt` contains the concrete objective, required behavior, constraints, and
  expected evidence. It does not grant permissions.
- `dependsOn` references only nodes in the block and forms a DAG.
- `sourceScopes` contains explicit repository-relative paths or globs. Use an
  empty array only for genuinely read-only work.
- Every Task and AC is covered by at least one node.

## Tasks

Use this exact checkbox and nested list syntax:

```markdown
# Tasks: <specific outcome>

- [ ] T-001: <executable task with a concrete result and constraints>
  - Covers: AC-001, AC-002
```

The `- [ ]`, Task id, colon, indentation, nested `- Covers:`, and referenced AC
ids are required. Keep each Task independently verifiable.

## Interface And Owner Facts

When the work affects an API, schema, event, config, permission, or module
boundary, describe the relevant interface, Owner, consumers, compatibility,
and source scope in the normal Plan sections. Do not create or publish a
separate Registry contract artifact. The Main Agent independently reviews the
proposal, project Skill, current source, and Registry before submitting any
required structured contract through the formal planning-acceptance tool.
