import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedProject } from "../../src/types/index.js";

const mocks = vi.hoisted(() => ({
  append: vi.fn(async () => undefined),
}));

vi.mock("../../src/workbench/canonical-timeline-command.js", () => ({
  appendCanonicalTimelineEntry: mocks.append,
}));

import { interruptConversation } from "../../src/workbench/actions/handlers/control.js";

describe("conversation interrupt handler", () => {
  beforeEach(() => {
    mocks.append.mockClear();
  });

  it("uses the shared Provider Turn owner before considering the local-run fallback", async () => {
    const interruptProviderTurn = vi.fn(async () => ({
      status: "interrupt-requested" as const,
      attemptId: "attempt-provider",
      runId: "run-provider",
    }));
    const findRunningRunForChange = vi.fn(async () => {
      throw new Error("local fallback must not run");
    });

    await expect(interruptConversation(
      project(),
      "change-1",
      "conversation-1",
      undefined,
      undefined,
      { interruptProviderTurn, findRunningRunForChange },
    )).resolves.toMatchObject({
      status: "interrupt-requested",
      realtime: true,
      runId: "run-provider",
      roleId: "main-agent",
    });

    expect(interruptProviderTurn).toHaveBeenCalledOnce();
    expect(findRunningRunForChange).not.toHaveBeenCalled();
    expect(mocks.append).toHaveBeenCalledWith(
      project(),
      "change-1",
      expect.objectContaining({ status: "interrupt-requested", runId: "run-provider" }),
      undefined,
    );
  });

  it("uses the existing local-run stop only when no active Provider Turn is owned", async () => {
    const interruptProviderTurn = vi.fn(async () => null);
    const findRunningRunForChange = vi.fn(async () => null);

    await expect(interruptConversation(
      project(),
      "change-1",
      "conversation-1",
      undefined,
      undefined,
      { interruptProviderTurn, findRunningRunForChange },
    )).resolves.toMatchObject({ status: "already-completed" });

    expect(interruptProviderTurn).toHaveBeenCalledOnce();
    expect(findRunningRunForChange).toHaveBeenCalledOnce();
  });
});

function project(): ManagedProject {
  return { id: "project-1", name: "Project", path: "E:\\project" } as ManagedProject;
}
