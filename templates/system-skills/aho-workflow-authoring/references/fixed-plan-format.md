# Fixed Proposal Format

Write these required files directly in the assigned proposal workspace:

```text
spec.md
plan.md
tasks.md
registry-contract.json
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

## Registry Contract Evidence

The Planner, not Runtime, decides whether the proposal changes an API, schema,
event, config, permission, or module boundary. Write exactly one explicit
`registry-contract.json`.

For a required contract:

```json
{
  "version": "1.0",
  "required": true,
  "contract": {
    "kind": "api",
    "subject": "health-endpoint",
    "operation": "add-health-endpoint",
    "owner_module": "http-service",
    "affected_paths": ["src/**", "test/**"],
    "consumers": ["operators"],
    "depends_on": [],
    "depends_on_changes": [],
    "compatibility": "GET / remains unchanged.",
    "status": "active"
  },
  "validation": ["Planner verified the owner and boundary against current source and project evidence."]
}
```

For work that needs no Registry contract, write `required: false`,
`contract: null`, and a concrete validation statement explaining the Agent's
classification. Runtime validates only this structure, identities, paths, and
conflicts; it never infers contract meaning from the Markdown.
