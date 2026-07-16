import { describe, expect, it } from "vitest";
import { buildAgentScopedTranscriptCells, buildParentAgentTranscript, pageParentAgentTranscript } from "../../src/workbench/parent-agent-transcript.js";

function providerBlockIdentity(itemId: string, identity: { attemptId?: string; threadId?: string; turnId?: string } = {}) {
  return {
    providerId: "codex" as const,
    attemptId: identity.attemptId ?? "attempt-1",
    threadId: identity.threadId ?? "thread-main",
    turnId: identity.turnId ?? "turn-1",
    itemId,
  };
}

describe("parent agent transcript paging", () => {
  it("projects only the artifact-backed AHO plan-ready item into the Main timeline", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: null, title: "Plan handoff" },
      threadItems: [{
        id: "assistant-plan-ready",
        kind: "assistant-turn",
        label: "AI",
        blocks: [
          {
            id: "internal-status",
            sequence: 1,
            kind: "tool-result" as const,
            source: "aho" as const,
            title: "内部状态",
            text: "This must remain diagnostic-only.",
          },
          {
            id: "plan-ready",
            runId: "run-plan",
            sequence: 2,
            kind: "tool-result" as const,
            source: "aho" as const,
            title: "计划已准备",
            text: "Plan Agent 已完成可确认的实现计划。",
            artifactRef: "proposal.json",
            targetAgentSurfaceId: "agent:codex:thread:plan",
          },
        ],
      }],
    });

    expect(transcript.cells).toEqual([
      expect.objectContaining({
        id: "cell:tool-result:plan-ready",
        source: "aho-orchestration",
        title: "计划已准备",
        evidenceRefs: [expect.objectContaining({ ref: "proposal.json", kind: "artifact" })],
      }),
    ]);
  });

  it("persists one completed turn boundary and a collapsed provider-visible reasoning summary", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Realtime history" },
      threadItems: [{
        id: "assistant-1",
        kind: "assistant-turn",
        label: "AI",
        source: "chat",
        timestamp: "2026-07-14T00:00:24.000Z",
        providerId: "codex",
        attemptId: "attempt-turn-1",
        runId: "run-1",
        threadId: "thread-1",
        turnId: "turn-1",
        activity: [
          { kind: "status", label: "started", timestamp: "2026-07-14T00:00:00.000Z" },
          { kind: "status", label: "connecting", timestamp: "2026-07-14T00:00:01.000Z" },
          { kind: "status", label: "thinking", timestamp: "2026-07-14T00:00:03.000Z" },
          { kind: "status", label: "completed", timestamp: "2026-07-14T00:00:24.000Z" },
        ],
        blocks: [{
          id: "reasoning-1",
          ...providerBlockIdentity("reasoning-1", { attemptId: "attempt-turn-1", threadId: "thread-1" }),
          runId: "run-1",
          sequence: 1,
          kind: "reasoning-summary",
          timestamp: "2026-07-14T00:00:03.000Z",
          source: "provider",
          text: "Checked the implementation boundary.",
        }],
      }],
    });

    expect(transcript.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "cell:turn:codex:attempt-turn-1:thread-1:turn-1", kind: "process-row", title: "已完成 · 24 秒", status: "completed" }),
      expect.objectContaining({ kind: "process-row", title: "思考摘要 · Checked the implementation boundary.", text: "", detailText: "Checked the implementation boundary." }),
    ]));
    expect(transcript.cells[0]?.id).toBe("cell:reasoning:codex:attempt-turn-1:thread-1:turn-1:reasoning-1");
    expect(transcript.cells.at(-1)?.id).toBe("cell:turn:codex:attempt-turn-1:thread-1:turn-1");
  });

  it("projects a provider child lifecycle as one navigable canonical process row", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: null, title: "Child lifecycle" },
      threadItems: [{
        id: "assistant-child-lifecycle",
        kind: "assistant-turn",
        label: "AI",
        providerId: "codex",
        attemptId: "attempt-1",
        runId: "run-1",
        threadId: "thread-main",
        turnId: "turn-main",
        blocks: [{
          id: "assistant:codex:run-1:thread-main:spawn-1:tool-result",
          providerId: "codex",
          attemptId: "attempt-1",
          runId: "run-1",
          threadId: "thread-main",
          turnId: "turn-main",
          itemId: "spawn-1",
          sequence: 1,
          kind: "tool-result",
          timestamp: "2026-07-16T00:00:00.000Z",
          source: "provider",
          status: "processing",
          title: "Plan Agent · Sagan",
          targetAgentSurfaceId: "agent:codex:thread:thread-child",
          targetAgentDisplayName: "Plan Agent · Sagan",
        }],
      }],
    });

    expect(transcript.cells).toEqual([expect.objectContaining({
      id: "cell:tool-result:codex:attempt-1:thread-main:turn-main:spawn-1",
      title: "Plan Agent · Sagan 正在规划",
      activityKind: "agent",
      status: "processing",
      targetAgentSurfaceId: "agent:codex:thread:thread-child",
    })]);
  });

  it("keeps the full transcript compatible and returns the latest page by default", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Long demand" },
      threadItems: Array.from({ length: 8 }, (_, index) => ({
        id: `msg-${index}`,
        kind: "user-message",
        label: `message ${index}`,
        body: `message ${index}`,
      })),
    });

    expect(transcript.cells).toHaveLength(8);
    expect(transcript.paging).toBeUndefined();

    const page = pageParentAgentTranscript(transcript, { limit: 3 });
    expect(page.cells.map((cell) => cell.text)).toEqual(["message 5", "message 6", "message 7"]);
    expect(page.items).toHaveLength(3);
    expect(page.paging).toEqual({
      limit: 3,
      totalCount: 8,
      hasMoreBefore: true,
      nextBeforeCursor: "cell:user:msg-5",
    });
  });

  it("returns earlier cells before the cursor without changing cell ids or order", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Long demand" },
      threadItems: Array.from({ length: 6 }, (_, index) => ({
        id: `msg-${index}`,
        kind: "user-message",
        label: `message ${index}`,
        body: `message ${index}`,
      })),
    });

    const page = pageParentAgentTranscript(transcript, { limit: 2, beforeCursor: "cell:user:msg-4" });
    expect(page.cells.map((cell) => cell.id)).toEqual(["cell:user:msg-2", "cell:user:msg-3"]);
    expect(page.paging?.hasMoreBefore).toBe(true);
    expect(page.paging?.nextBeforeCursor).toBe("cell:user:msg-2");
  });

  it("keeps synthetic large transcript paging bounded without durable pressure fixtures", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Synthetic pressure" },
      threadItems: syntheticThreadItems(10_000),
    });

    expect(transcript.cells).toHaveLength(10_000);
    const latest = pageParentAgentTranscript(transcript, { limit: 100 });
    expect(latest.cells).toHaveLength(100);
    expect(latest.cells[0]?.id).toBe("cell:user:msg-9900");
    expect(latest.cells.at(-1)?.id).toBe("cell:assistant:codex:attempt-9999:thread-main:turn-9999:block-9999");
    expect(latest.paging).toEqual({
      limit: 100,
      totalCount: 10_000,
      hasMoreBefore: true,
      nextBeforeCursor: "cell:user:msg-9900",
    });

    const earlier = pageParentAgentTranscript(transcript, { limit: 100, beforeCursor: latest.paging?.nextBeforeCursor });
    expect(earlier.cells).toHaveLength(100);
    expect(earlier.cells[0]?.id).toBe("cell:user:msg-9800");
    expect(earlier.cells.at(-1)?.id).toBe("cell:assistant:codex:attempt-9899:thread-main:turn-9899:block-9899");
  });

  it("keeps identical visible content from distinct canonical message items", () => {
    const threadItems = ["message-1", "message-2"].map((itemId) => ({
      id: `assistant-${itemId}`,
      kind: "assistant-turn",
      label: "AI",
      blocks: [{
        id: itemId,
        ...providerBlockIdentity(itemId),
        sequence: 1,
        kind: "prose" as const,
        source: "provider" as const,
        text: "Same visible reply",
      }],
    }));

    const cells = buildParentAgentTranscript({ workpad: { title: "Identity" }, threadItems }).cells;
    expect(cells.map((cell) => cell.id)).toEqual([
      "cell:assistant:codex:attempt-1:thread-main:turn-1:message-1",
      "cell:assistant:codex:attempt-1:thread-main:turn-1:message-2",
    ]);
    expect(cells.map((cell) => cell.text)).toEqual(["Same visible reply", "Same visible reply"]);
  });

  it("keeps canonical cell identity stable across snapshot refresh projection", () => {
    const threadItems = [{
      id: "assistant-refresh",
      kind: "assistant-turn",
      label: "AI",
      blocks: [{
        id: "message-refresh",
        ...providerBlockIdentity("message-refresh", { attemptId: "attempt-refresh", turnId: "turn-refresh" }),
        sequence: 1,
        kind: "prose" as const,
        source: "provider" as const,
        text: "Stable reply",
      }],
    }];
    const input = { workpad: { conversationId: "conv", title: "Refresh" }, threadItems };

    expect(buildParentAgentTranscript(input).cells.map((cell) => cell.id))
      .toEqual(buildParentAgentTranscript(input).cells.map((cell) => cell.id));
  });

  it("fails closed for provider-visible blocks without canonical identity", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { title: "Missing identity" },
      threadItems: [{
        id: "assistant-missing-identity",
        kind: "assistant-turn",
        label: "AI",
        blocks: [{ id: "message", sequence: 1, kind: "prose", source: "provider", text: "Do not infer me" }],
      }],
    });

    expect(transcript.cells).toEqual([]);
  });

  it("keeps child-agent transcript cells out of the parent transcript and available by role", () => {
    const childBlock = {
      id: "planning-prose",
      ...providerBlockIdentity("planning-prose", { threadId: "thread-planning" }),
      sequence: 1,
      kind: "prose" as const,
      timestamp: "2026-07-02T10:00:00.000Z",
      source: "provider" as const,
      text: "Planning-agent draft body stays in the Agent workspace.",
    };
    const threadItems = [
      {
        id: "main-response",
        kind: "assistant-turn",
        label: "assistant",
        body: "Main agent response.",
        blocks: [{
          id: "main-prose",
          ...providerBlockIdentity("main-prose"),
          sequence: 1,
          kind: "prose" as const,
          timestamp: "2026-07-02T10:00:00.000Z",
          source: "provider" as const,
          text: "Main agent response.",
        }],
      },
      {
        id: "planning-response",
        kind: "assistant-turn",
        label: "planning-agent",
        body: "Planning-agent draft body stays in the Agent workspace.",
        runId: "run-planning",
        threadId: "thread-planning",
        agentRoleId: "planning-agent",
        agentTaskId: "task-planning",
        blocks: [childBlock],
      },
    ];

    const parent = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Agent split" },
      threadItems,
    });
    const childCells = buildAgentScopedTranscriptCells(threadItems, { agentRoleId: "planning-agent", threadId: "thread-planning" });

    expect(parent.cells.map((cell) => cell.text).join("\n")).toContain("Main agent response.");
    expect(parent.cells.map((cell) => cell.text).join("\n")).not.toContain("Planning-agent draft body");
    expect(childCells).toEqual([
      expect.objectContaining({
        agentRoleId: "planning-agent",
        agentTaskId: "task-planning",
        runId: "run-planning",
        threadId: "thread-planning",
        text: "Planning-agent draft body stays in the Agent workspace.",
      }),
    ]);
  });

  it("keeps revised planning proposals separated by run and artifact", () => {
    const threadItems = [
      {
        id: "planning-initial",
        kind: "assistant-turn",
        label: "planning-agent",
        runId: "run-initial",
        artifact: "initial-proposal.json",
        agentRoleId: "planning-agent",
        agentTaskId: "planner-thread",
        blocks: [{
          id: "initial-plan",
          ...providerBlockIdentity("initial-plan", { attemptId: "attempt-initial", threadId: "planner-thread", turnId: "turn-initial" }),
          sequence: 1,
          kind: "prose" as const,
          source: "provider" as const,
          text: "# Plan: Initial proposal",
        }],
      },
      {
        id: "planning-revision",
        kind: "assistant-turn",
        label: "planning-agent",
        runId: "run-revision",
        artifact: "revised-proposal.json",
        agentRoleId: "planning-agent",
        agentTaskId: "planner-thread",
        blocks: [{
          id: "revised-plan",
          ...providerBlockIdentity("revised-plan", { attemptId: "attempt-revision", threadId: "planner-thread", turnId: "turn-revision" }),
          sequence: 1,
          kind: "prose" as const,
          source: "provider" as const,
          text: "# Plan: Revised proposal",
        }],
      },
    ];

    expect(buildAgentScopedTranscriptCells(threadItems, { agentRoleId: "planning-agent" })).toEqual([
      expect.objectContaining({
        runId: "run-initial",
        text: "# Plan: Initial proposal",
        evidenceRefs: [expect.objectContaining({ ref: "initial-proposal.json" })],
      }),
      expect.objectContaining({
        runId: "run-revision",
        text: "# Plan: Revised proposal",
        evidenceRefs: [expect.objectContaining({ ref: "revised-proposal.json" })],
      }),
    ]);
  });

  it("keeps same-role Agent transcripts separated by provider thread", () => {
    const threadItems = ["thread-coder-1", "thread-coder-2"].map((threadId, index) => ({
      id: `coder-${index + 1}`,
      kind: "assistant-turn",
      label: "coder-agent",
      runId: `run-coder-${index + 1}`,
      threadId,
      agentRoleId: "coder-agent",
      blocks: [{
        id: `coder-prose-${index + 1}`,
        ...providerBlockIdentity(`coder-prose-${index + 1}`, { attemptId: `attempt-coder-${index + 1}`, threadId, turnId: `turn-coder-${index + 1}` }),
        sequence: 1,
        kind: "prose" as const,
        source: "provider" as const,
        text: `Coder ${index + 1} result`,
      }],
    }));

    expect(buildAgentScopedTranscriptCells(threadItems, { agentRoleId: "coder-agent", threadId: "thread-coder-1" })
      .map((cell) => cell.text)).toEqual(["Coder 1 result"]);
    expect(buildAgentScopedTranscriptCells(threadItems, { agentRoleId: "coder-agent", threadId: "thread-coder-2" })
      .map((cell) => cell.text)).toEqual(["Coder 2 result"]);
  });

  it("preserves provider-visible planning sections in main-agent prose", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Main plan leak" },
      threadItems: [{
        id: "main-leak",
        kind: "assistant-turn",
        label: "AI",
        blocks: [{
          id: "main-leak-block",
          ...providerBlockIdentity("main-leak-block"),
          sequence: 1,
          kind: "prose" as const,
          source: "provider" as const,
          text: "我先确认需求，不会修改文件。\n\n## 目标\n做事\n\n## 验收标准\n- 通过",
        }],
      }],
    });

    expect(transcript.cells.map((cell) => cell.text)).toEqual(["我先确认需求，不会修改文件。\n\n## 目标\n做事\n\n## 验收标准\n- 通过"]);
  });

  it("preserves persisted provider-visible text when lazy transcript pages are rebuilt", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Lazy transcript leak" },
      threadItems: [{
        id: "persisted-main-leak",
        kind: "assistant-turn",
        label: "AI",
        blocks: [{
          id: "persisted-main-leak-block",
          ...providerBlockIdentity("persisted-main-leak-block"),
          sequence: 1,
          kind: "prose" as const,
          source: "provider" as const,
          text: [
            "我会先确认当前约束，不修改文件。",
            "",
            "计划代理已经启动，我现在只等待它返回计划。",
            "",
            "实施计划：",
            "1. 读取项目说明。",
            "",
            "验证方式：",
            "打开页面检查。",
          ].join("\n"),
        }],
      }],
    });

    const page = pageParentAgentTranscript(transcript, { limit: 100 });
    const visibleText = page.cells.map((cell) => cell.text).join("\n");

    expect(visibleText).toBe([
      "我会先确认当前约束，不修改文件。",
      "",
      "计划代理已经启动，我现在只等待它返回计划。",
      "",
      "实施计划：",
      "1. 读取项目说明。",
      "",
      "验证方式：",
      "打开页面检查。",
    ].join("\n"));
  });

  it("preserves assistant delegation explanations in the parent transcript", () => {
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", boundChangeId: "change", title: "Planning delegation leak" },
      threadItems: [{
        id: "main-delegation-leak",
        kind: "assistant-turn",
        label: "AI",
        blocks: [{
          id: "main-delegation-leak-block",
          ...providerBlockIdentity("main-delegation-leak-block"),
          sequence: 1,
          kind: "prose" as const,
          source: "provider" as const,
          text: "我理解这次目标是完成验收，并保持当前回合只读。\n这条回复之后，我会把只读规划交给 planning-agent；当前不会修改文件。",
        }],
      }],
    });

    expect(transcript.cells.map((cell) => cell.text)).toEqual(["我理解这次目标是完成验收，并保持当前回合只读。\n这条回复之后，我会把只读规划交给 planning-agent；当前不会修改文件。"]);
  });

  it("keeps a native Agent question as one durable timeline item after submission", () => {
    const request = {
      providerId: "codex" as const,
      requestKey: "run-1:main:turn:item:request-1",
      requestId: "request-1",
      runId: "run-1",
      runtimeScopeId: "conv",
      attemptId: "run-1",
      conversationId: "conv",
      questions: [{
        id: "q1",
        question: "是否保留旧文件？",
        inputMode: "single" as const,
        allowCustom: false,
        options: [{ value: "discard", label: "不保留" }],
      }],
      status: "submitted" as const,
      publicAnswers: { q1: "不保留" },
      disposition: "answered" as const,
      submittedAt: "2026-07-15T00:00:05.000Z",
    };
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", title: "Question history" },
      threadItems: [{
        id: "provider-user-input:run-1:main:turn:item:request-1",
        kind: "assistant-turn",
        label: "需要你回答",
        source: "chat",
        timestamp: "2026-07-15T00:00:00.000Z",
        providerUserInput: request,
      }],
    });

    expect(transcript.cells).toEqual([expect.objectContaining({
      id: "cell:provider-user-input:run-1:main:turn:item:request-1",
      kind: "user-input",
      status: "submitted",
      interactionHistory: {
        kind: "provider-input",
        status: "answered",
        questions: [{ questionId: "q1", title: "是否保留旧文件？" }],
        answers: { q1: "不保留" },
      },
    })]);
    expect(transcript.cells[0]).not.toHaveProperty("providerUserInput");
  });

  it("keeps repeated provider request ids distinct across durable turns", () => {
    const requests = ["turn-a", "turn-b"].map((turnId) => ({
      providerId: "codex" as const,
      requestKey: `run-${turnId}:main:${turnId}:item:1`,
      requestId: "1",
      runId: `run-${turnId}`,
      runtimeScopeId: "conv",
      attemptId: `run-${turnId}`,
      threadId: "main",
      turnId,
      conversationId: "conv",
      questions: [{
        id: "q1",
        question: `Question ${turnId}`,
        inputMode: "text" as const,
        allowCustom: true,
        options: [],
      }],
      status: "submitted" as const,
      disposition: "answered" as const,
      publicAnswers: { q1: `Answer ${turnId}` },
    }));
    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", title: "Repeated request ids" },
      threadItems: requests.map((request) => ({
        id: `provider-user-input:${request.requestKey}`,
        kind: "assistant-turn" as const,
        label: "需要你回答",
        source: "chat" as const,
        timestamp: "2026-07-15T00:00:00.000Z",
        providerUserInput: request,
      })),
    });

    expect(transcript.cells.map((cell) => cell.id)).toEqual([
      `cell:provider-user-input:${requests[0].requestKey}`,
      `cell:provider-user-input:${requests[1].requestKey}`,
    ]);
  });

  it("keeps pending provider questions exclusively in the Interaction Dock projection", () => {
    const request = {
      providerId: "codex" as const,
      requestKey: "run-pending:main:turn:item:1",
      requestId: "1",
      runId: "run-pending",
      runtimeScopeId: "conv",
      attemptId: "run-pending",
      conversationId: "conv",
      questions: [{ id: "q1", question: "Pending question", inputMode: "text" as const, allowCustom: true, options: [] }],
      status: "pending" as const,
    };

    const transcript = buildParentAgentTranscript({
      workpad: { conversationId: "conv", title: "Pending request" },
      threadItems: [{
        id: `provider-user-input:${request.requestKey}`,
        kind: "assistant-turn",
        label: "需要你回答",
        source: "chat",
        timestamp: "2026-07-15T00:00:00.000Z",
        providerUserInput: request,
      }],
    });

    expect(transcript.cells).toEqual([]);
  });
});

function syntheticThreadItems(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const timestamp = new Date(Date.UTC(2026, 5, 26, 0, 0, index % 60)).toISOString();
    if (index % 2 === 0) {
      return {
        id: `msg-${index}`,
        kind: "user-message",
        label: `Scoped user request ${index}`,
        body: `Please update bounded transcript fixture ${index}.`,
        timestamp,
      };
    }
    return {
      id: `msg-${index}`,
      kind: "assistant-turn",
      label: `assistant ${index}`,
      timestamp,
      blocks: [{
        id: `block-${index}`,
        ...providerBlockIdentity(`block-${index}`, { attemptId: `attempt-${index}`, turnId: `turn-${index}` }),
        sequence: index,
        kind: "prose" as const,
        timestamp,
        source: "provider" as const,
        title: `Codex response ${index}`,
        text: `Synthetic assistant transcript body ${index}. ${"detail ".repeat(index % 8)}`,
      }],
    };
  });
}
