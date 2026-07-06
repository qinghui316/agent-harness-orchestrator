# Tasks: provider-native-a2a-real-ui-acceptance-fix-pass-v1

- [x] T-001: Rebuild and restart the real Workbench server on port 4477.
  - Covers: AC-001
- [x] T-002: Run real browser acceptance for the new-demand main Agent turn and record DOM/API/runtime evidence.
  - Covers: AC-001, AC-002, AC-003
- [x] T-003: Verify or repair provider-native plan/question/child-agent event projection into the `plan-session` / Plan Agent workspace or a real planning-agent workspace.
  - Covers: AC-003, AC-004, AC-005
  - Completed evidence: real Codex app-server run `chat-conv-mr8t1vqs-d840d00f-mr8wsw6u` emitted `turn/plan/updated`. AHO now stores that native plan update as a `plan-session` scoped transcript message with title `计划会话`; it no longer appears as fake `planning-agent` content.
  - Capability boundary: this run did not emit `spawn_agent`, `send_input`, `wait_agent`, `collabToolCall`, `collabAgentToolCall`, or `item/tool/requestUserInput`. It is accepted as native Plan Mode plan-session projection, not as full native child-agent spawn acceptance.
- [x] T-004: Verify or repair right-side plan feedback and provider-native plan handoff/runtime continuation without parsing composer text.
  - Covers: AC-006, AC-007, AC-009, AC-010
  - Completed: ordinary project Plan sessions no longer convert feedback or implementation intent into Workbench planning actions. Feedback stays in the conversation Plan Mode path.
- [x] T-005: Run targeted and standard verification, then update review/summary with real evidence.
  - Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007
  - Verification completed: targeted Codex/Workbench tests; `npm run typecheck`;
    `npm run lint`; `npm run build`; `npm run test:fast`;
    `npm run test:workbench`; ECL/encoding/reindex/evolve checks; real browser
    run for `conv-mr8t1vqs-d840d00f`.
- [x] T-006: Split native Codex Plan Mode sessions from real provider child-agent
  sessions so main-Agent plan deltas no longer appear as fake `planning-agent`
  transcript content.
  - Covers: AC-002, AC-003, AC-004, AC-005, AC-008
- [x] T-007: Tighten Agent workspace projection so `planning-agent` appears only
  for real provider child-agent/collab ownership; native Plan Mode without a
  child session appears as a plan session instead.
  - Covers: AC-004, AC-008
  - Completed evidence: unit/read-model tests cover clean conversations where
    only `plan-session` is projected and no `planning-agent` appears.
- [x] T-008: Replace composer text implementation intent with provider-native
  plan handoff/runtime continuation, and ensure ordinary project Plan Mode does
  not create/bind Harness Change state or call `planning.confirm-execution`.
  - Covers: AC-006, AC-007, AC-009
- [x] T-009: Remove fallback decomposition task generation when no
  Agent-authored tasks exist.
  - Covers: AC-010
- [x] T-010: Remove the old Workbench-engineered planning action path from
  registry, handlers, next-action projection, confirmation/read-model
  surfaces, and Agent workspace.
  - Covers: AC-006, AC-009, AC-011
- [x] T-011: Rewrite affected tests and docs so ordinary chat / Plan session
  no longer depends on `planning.generate`, `planning.revise`,
  `planning.confirm-execution`, or `latest-bundle`.
  - Covers: AC-009, AC-010, AC-011
