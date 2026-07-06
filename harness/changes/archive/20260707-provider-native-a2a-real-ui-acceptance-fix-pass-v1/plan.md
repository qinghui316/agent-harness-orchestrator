# Plan: provider-native-a2a-real-ui-acceptance-fix-pass-v1

## Approach

Use the real product path first, then patch only the owners proven wrong by the
run. The acceptance pass starts from a rebuilt Workbench server and in-app
browser. It records runtime events, DOM surfaces, and API snapshots before any
code changes. Fixes stay scoped to Codex bridge/event projection, parent
transcript filtering, Agent workspace rendering, or planning action handling.

## Steps

1. Rebuild and restart the Workbench server on `127.0.0.1:4477`.
2. Use the in-app browser against `goal-loop-demo-real` and record the current
   DOM, transcript, Agent workspace, and relevant API snapshots.
3. Send a new demand through the normal composer and observe whether the main
   Agent reply is real live app-server output.
4. Inspect app-server/live events for assistant deltas, native plan events,
   runtime user-input requests, and any child-agent / collab tool events.
5. Exercise the right-side plan surface if native plan/session events exist:
   plan stream, question card, feedback revision, and any provider-native plan
   handoff / runtime continuation. The composer is feedback-only and must not
   parse implementation text.
6. If the real flow diverges, patch the narrow owner:
   - Codex bridge/event mapping for missing or wrongly owned events.
   - Parent transcript projection when child plan content leaks to the center.
   - Agent workspace rendering when plan/question/history is missing or styled
     as custom cards instead of transcript content.
   - Planning handler only when it still manufactures fake plan content or
     creates Harness state from ordinary project chat.
7. Run targeted tests, standard verification, and repeat the browser flow.
8. Update change review/summary with real evidence and close/commit only if the
   real acceptance is passed or correctly blocked by external runtime
   unavailability.

## Decisions

- Do not infer child-agent delegation from visible text or keywords.
- Do not add AHO-specific fake planning controls to make the demo pass.
- Treat provider-native runtime events as UI projection input, not Harness
  truth or execution authority.

## Minimality Gate Plan

- Can this be a no-op: yes if the real browser run already proves the required
  event ownership and UI flow; then only evidence docs are updated.
- Reuse: existing Codex app-server bridge, live event projection, parent
  transcript, Agent workspace, and provider runtime continuation. Removed
  Workbench-generated planning actions must not be reintroduced as compatibility
  paths.
- Shared root fix: inspect bridge/projection owner before adding UI-only guards.
- Avoided: new provider runtime, new action type, new local delegation parser,
  new automation permission, and fake planning fallback.
- Smallest coherent change: fix only the first wrong owner proven by real
  acceptance evidence.

## Module Boundary Plan

- Owner module: existing Codex bridge, Workbench projection, parent transcript,
  Agent workspace, or planning action owner as identified by acceptance.
- New / moved responsibilities: none expected; this is an acceptance/fix pass.
- Facade touch points: Workbench server/API, browser live event stream, Agent
  workspace read model.
- Forbidden write-back locations: Harness Change/evidence managers from
  ordinary project chat; confirmationQueue/action registry/automation
  allowlist/ToolPolicyGate/Scheduler/IntegrationCheck/apply/close.
- Compatibility surface: old conversation snapshots may break; current testing
  phase allows that.
- Boundary tests: module boundary tests plus targeted Workbench/Codex tests for
  any changed owner.
- Follow-up split candidates: provider-neutral non-Codex adapters remain future
  work.

## Core Mechanism Reuse Plan

- Existing mechanisms reused or strengthened: Codex app-server native events,
  live event projection, Agent workspace transcript/composer, parent transcript
  filtering, and provider runtime continuation.
- Why existing mechanisms are insufficient if a new mechanism is proposed: no
  new mechanism should be proposed unless real acceptance shows the existing
  bridge cannot represent a provider-native event.
- Domain-specific logic location: planning handler/adapter only for validating
  and landing Agent-authored plan artifacts.
- Shared cross-cutting logic location: provider event normalization and live
  projection only if owner ambiguity is proven.
- Local framework / state machine / projection / validation / gate avoided:
  avoid a new planning questionnaire engine, text parser delegation, or second
  controller.
- Future-cost reduction for similar features: provider-native events stay
  provider-neutral enough for future Claude/OpenCode adapters.

## Planning-Discovered Gaps

- Need real runtime evidence for whether Codex 0.142.0 emits native child-agent
  / collab-tool events in this Workbench path.
- Follow-up inspection showed the accepted native Plan Mode fix still labels a
  main-Agent plan update as `planning-agent` and the Agent workspace always
  creates a planning-agent row for any selected conversation. Repair must split
  native plan sessions from real provider child-agent sessions before any
  further A2A acceptance claim.
- V3.1 extension: the right workspace still contains an old composer shortcut
  that interprets typed text like "实施此计划" as implementation. The reference
  flow uses a plan handoff card/button, so implementation must move to an
  explicit handoff action while the composer remains feedback-only.
- V3.1 extension: decomposition still has a fallback task when planning lacks
  Agent-authored task evidence. That fallback must be removed so runtime does
  not invent workflow content.
- V3.1 correction after reference re-check: ordinary project-scoped Plan Mode
  must not create or bind a Harness Change just because the plan became
  parseable. The plan remains provider runtime UI content. If the user chooses
  to execute, control must return to the Agent/runtime so the Agent can read
  project guidance and enter Harness through tools when appropriate.
- V2 deletion extension: do not retain compatibility for the old engineered
  planning chain. Remove `planning.generate`, `planning.revise`,
  `planning.confirm-execution`, `latest-bundle`, and planning bundle projection
  from the normal Workbench product path. If old tests depend on those surfaces,
  rewrite them to the provider-native Plan session boundary instead of adding
  compatibility shims.
