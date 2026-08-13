// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillsSettingsView } from "../../src/web/src/panels/SkillsSettingsView.js";
import type { SkillListItem } from "../../src/web/src/types.js";

const fetchJson = vi.fn();
const postJson = vi.fn();

vi.mock("../../src/web/src/api.js", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
  postJson: (...args: unknown[]) => postJson(...args),
}));

afterEach(() => {
  cleanup();
  fetchJson.mockReset();
  postJson.mockReset();
});

describe("SkillsSettingsView request identity", () => {
  it("ignores a late catalog response after the Provider changes", async () => {
    const initial = deferred<{ skills: SkillListItem[] }>();
    fetchJson
      .mockImplementationOnce(() => initial.promise)
      .mockResolvedValueOnce({ skills: [skill("current-skill")] });
    const view = render(<SkillsSettingsView
      projectId="repo"
      productMode="agent"
      conversationId="conversation-1"
      providerId="codex"
      onRefresh={vi.fn()}
    />);
    await waitFor(() => expect(fetchJson).toHaveBeenCalledTimes(1));

    view.rerender(<SkillsSettingsView
      projectId="repo"
      productMode="agent"
      conversationId="conversation-1"
      providerId="other-provider"
      onRefresh={vi.fn()}
    />);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Skill 列表" })).getByText("current-skill")).toBeTruthy());
    initial.resolve({ skills: [skill("stale-skill")] });
    await Promise.resolve();

    expect(within(screen.getByRole("list", { name: "Skill 列表" })).getByText("current-skill")).toBeTruthy();
    expect(screen.queryByText("stale-skill")).toBeNull();
  });

  it("does not refresh the current scope after an old Provider mutation completes", async () => {
    const mutation = deferred<void>();
    const refresh = vi.fn(async () => undefined);
    fetchJson.mockResolvedValue({ skills: [skill("reviewer")] });
    postJson.mockImplementationOnce(() => mutation.promise);
    const view = render(<SkillsSettingsView
      projectId="repo"
      productMode="agent"
      conversationId="conversation-1"
      providerId="codex"
      onRefresh={refresh}
    />);
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Skill 列表" })).getByText("reviewer")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /刷新/ }));
    await waitFor(() => expect(postJson).toHaveBeenCalledTimes(1));

    view.rerender(<SkillsSettingsView
      projectId="repo"
      productMode="agent"
      conversationId="conversation-1"
      providerId="other-provider"
      onRefresh={refresh}
    />);
    await waitFor(() => expect(fetchJson.mock.calls.some((call) => String(call[0]).includes("providerId=other-provider"))).toBe(true));
    mutation.resolve();
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
  });
});

function skill(skillId: string): SkillListItem {
  return {
    skillId,
    name: skillId,
    description: `${skillId} description`,
    sourcePath: `C:/skills/${skillId}/SKILL.md`,
    sourceKind: "custom",
    scope: "repo",
    contentHash: `hash-${skillId}`,
    compatibility: { requiredCapabilities: [] },
    providerBindings: [{
      providerId: "codex",
      bindingKind: "native",
      status: "ready",
      contentHash: `hash-${skillId}`,
      scope: "repo",
    }],
    providerEnabled: true,
    required: false,
    runtimeAssigned: false,
    enabledProject: false,
    enabledTopics: [],
    disabledTopics: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
