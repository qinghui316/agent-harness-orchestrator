# Complete Worked Example

This example teaches the relationship between user-readable artifacts and the
machine Workflow appendix. Do not copy its endpoint, paths, node count, or
topology. The task facts must determine every proposal.

## Demand

Add `GET /healthz` returning HTTP 200 and `{"status":"ok"}`. Add one
regression test and preserve `GET /`.

## Proposal Files

Write the following content to `spec.md`, `plan.md`, and `tasks.md` using the
fixed format. This compact envelope is shown only to keep the Markdown example
readable; it is not the Runtime input format.

````json
{
  "specMd": "# Spec: Add a health check endpoint\n\n## Purpose\nExpose a lightweight health signal while preserving the existing root route.\n\n## Users\nOperators and local developers checking service availability.\n\n## Acceptance Criteria\n\n- AC-001: GET /healthz returns HTTP 200.\n- AC-002: GET /healthz returns {\"status\":\"ok\"}.\n- AC-003: GET / preserves its existing behavior.\n\n## Non-Goals\nNo authentication, metrics, or readiness dependency checks.\n\n## Constraints\nUse the existing HTTP service and test framework.\n\n## Risks\nThe new route must not change root-route dispatch.",
  "planMd": "# Plan: Add a health check endpoint\n\n## Goal\nAdd a small health endpoint that reports the service is running. Preserve the existing root route so current users see no behavior change.\n\n## Proposed Changes\n- **Health endpoint:** Add GET /healthz with a stable HTTP 200 JSON response.\n- **Existing behavior:** Keep GET / unchanged.\n- **Regression coverage:** Cover both routes with the existing test framework.\n\n## Implementation\n1. Extend the existing HTTP route handling with the health response, without changing root-route behavior. Verify both status and JSON body.\n2. Add focused regression coverage for the new endpoint and retain coverage for the root route.\n\n## Verification\n- GET /healthz returns HTTP 200.\n- Its response body is {\"status\":\"ok\"}.\n- GET / behaves as before.\n- The project test command passes.\n\n## Risks And Assumptions\nAssume the existing service and test framework are the correct extension points.\n\n## Workflow\n```json\n{\n  \"version\": \"1.0\",\n  \"mode\": \"sequential-v1\",\n  \"nodes\": [\n    {\n      \"id\": \"add-health-endpoint\",\n      \"title\": \"Expose application health through GET /healthz\",\n      \"taskIds\": [\"T-001\"],\n      \"acIds\": [\"AC-001\", \"AC-002\", \"AC-003\"],\n      \"prompt\": \"Objective: Add GET /healthz. Required behavior: Return HTTP 200 with {\\\"status\\\":\\\"ok\\\"} and preserve GET /. Constraints: Use existing service and test boundaries within the accepted source scopes. Expected evidence: Return changed files and regression-test results for both routes.\",\n      \"dependsOn\": [],\n      \"sourceScopes\": [\"src/**\", \"test/**\"]\n    }\n  ]\n}\n```",
  "tasksMd": "# Tasks: Add a health check endpoint\n\n- [ ] T-001: Add the health endpoint, preserve the root route, and cover both behaviors with regression tests.\n  - Covers: AC-001, AC-002, AC-003",
  "openQuestions": [],
  "assumptions": ["The existing HTTP service and test framework are the intended extension points."],
  "warnings": []
}
````

Also write `registry-contract.json`:

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
  "validation": ["Planner verified the endpoint owner and compatibility boundary against current source."]
}
```

The planner child returns the complete `plan.md` after writing all four files.
