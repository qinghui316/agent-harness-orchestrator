# Fixed Proposal Format

Return a structured object with exactly these fields:

```json
{
  "specMd": "...",
  "planMd": "...",
  "tasksMd": "...",
  "openQuestions": [],
  "assumptions": [],
  "warnings": []
}
```

All six fields are required. Markdown fields are strings; the remaining fields
are arrays of strings. Do not wrap the object in commentary or a markdown code
fence.

## `specMd`

Use these headings in order:

```markdown
# Spec: <change title>

## Purpose
## Users
## Acceptance Criteria
## Non-Goals
## Constraints
## Risks
```

Number acceptance criteria as `AC-001`, `AC-002`, and so on. Make each criterion
observable and testable.

## `planMd`

Use these headings in order:

```markdown
# Plan: <change title>

## Approach
## Steps
## Decisions
## Verification
## Workflow
```

Under `## Workflow`, include exactly one fenced `json` block with this
shape and no extra fields:

```json
{
  "version": "1.0",
  "mode": "sequential-v1",
  "nodes": [
    {
      "id": "implement-change",
      "title": "Implement change",
      "taskIds": ["T-001"],
      "acIds": ["AC-001"],
      "prompt": "Implement the accepted task within the listed source scopes and return changed files plus verification evidence.",
      "dependsOn": [],
      "sourceScopes": ["src/owned-boundary/**"]
    }
  ]
}
```

Contract rules:

- `version` is exactly `"1.0"`.
- `mode` is exactly `"sequential-v1"` or `"ready-set-v1"`.
- Node `id` values are unique stable kebab-case identifiers.
- In v1, `taskIds` contains exactly one existing task identifier; split work
  into multiple nodes when multiple tasks are needed. `acIds` may contain one
  or more existing acceptance-criterion identifiers.
- `prompt` states the bounded objective, constraints, expected result, and
  verification evidence. It does not grant permissions.
- `dependsOn` contains only node ids in the same block and forms an acyclic
  graph.
- `sourceScopes` contains explicit repository-relative paths or globs. Use an
  empty array only for a genuinely read-only or non-source task.
- Every task and acceptance criterion is covered by at least one node.

## `tasksMd`

Use this shape:

```markdown
# Tasks: <change title>

- [ ] T-001: <executable task>
  - Covers: AC-001
```

Keep tasks independently verifiable and align each `Covers` entry with the
node's `taskIds` and `acIds`.
