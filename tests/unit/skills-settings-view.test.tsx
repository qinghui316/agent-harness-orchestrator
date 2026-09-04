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

  it("groups Skills, opens details on demand, and hides absolute paths outside source settings", async () => {
    fetchJson.mockResolvedValue({ skills: [skill("reviewer")], roots: [{ rootPath: "C:/skills", sourceKind: "custom", updatedAt: "2026-09-04T00:00:00.000Z" }] });
    render(<SkillsSettingsView projectId="repo" productMode="agent" conversationId="conversation-1" providerId="codex" onRefresh={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("已启用")).toBeTruthy());
    expect(screen.queryByText("C:/skills/reviewer/SKILL.md")).toBeNull();
    const skillTrigger = screen.getByRole("button", { name: /reviewer/ });
    fireEvent.click(skillTrigger);
    expect(screen.getByRole("dialog", { name: "reviewer 详情" })).toBeTruthy();
    expect(screen.queryByText("C:/skills/reviewer/SKILL.md")).toBeNull();
    const closeDetail = screen.getByRole("button", { name: "关闭 Skill 详情" });
    expect(document.activeElement).toBe(closeDetail);
    fireEvent.click(closeDetail);
    expect(screen.queryByRole("dialog", { name: "reviewer 详情" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(skillTrigger));
    const sourceTrigger = screen.getByRole("button", { name: "Skill 来源设置" });
    sourceTrigger.focus();
    fireEvent.click(sourceTrigger);
    expect(screen.getByRole("dialog", { name: "Skill 来源设置" })).toBeTruthy();
    expect(screen.getByText("C:/skills")).toBeTruthy();
    const sourceInput = screen.getByRole("textbox", { name: "Skill 根目录" });
    const closeSource = screen.getByRole("button", { name: "关闭 Skill 来源设置" });
    expect(document.activeElement).toBe(closeSource);
    sourceInput.focus();
    fireEvent.keyDown(sourceInput, { key: "Tab" });
    expect(document.activeElement).toBe(closeSource);
    fireEvent.click(closeSource);
    await waitFor(() => expect(document.activeElement).toBe(sourceTrigger));
  });

  it("closes a detail drawer when search filters out the selected Skill", async () => {
    fetchJson.mockResolvedValue({ skills: [skill("reviewer"), skill("planner")] });
    render(<SkillsSettingsView projectId="repo" productMode="agent" conversationId="conversation-1" providerId="codex" onRefresh={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("reviewer")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /reviewer/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "搜索 Skills" }), { target: { value: "planner" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "reviewer 详情" })).toBeNull());
    expect(screen.getByText("planner")).toBeTruthy();
  });

  it("redacts absolute paths from catalog diagnostics", async () => {
    fetchJson.mockResolvedValue({
      skills: [skill("reviewer")],
      errors: [{
        path: "C:/Users/example/.codex/skills/broken/SKILL.md",
        message: "Cannot read Skill package: /root/.codex/skills/broken",
      }],
    });
    render(<SkillsSettingsView projectId="repo" productMode="agent" conversationId="conversation-1" providerId="codex" onRefresh={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("有 1 个 Skill 无法读取。")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "查看诊断" }));

    expect(screen.getByText("…/broken/SKILL.md")).toBeTruthy();
    expect(screen.getByText("Cannot read Skill package: [本机路径已隐藏]")).toBeTruthy();
    expect(screen.queryByText(/\/root\/\.codex/)).toBeNull();
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
    await waitFor(() => expect((screen.getByRole("button", { name: /刷新/ }) as HTMLButtonElement).disabled).toBe(false));
    mutation.resolve();
    await Promise.resolve();

    expect(refresh).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: /刷新/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not publish an older same-identity load failure after a newer load succeeds", async () => {
    const stale = deferred<{ skills: SkillListItem[] }>();
    fetchJson
      .mockImplementationOnce(() => stale.promise)
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
      projectId={null}
      productMode="agent"
      conversationId={null}
      providerId="codex"
      onRefresh={vi.fn()}
    />);
    view.rerender(<SkillsSettingsView
      projectId="repo"
      productMode="agent"
      conversationId="conversation-1"
      providerId="codex"
      onRefresh={vi.fn()}
    />);
    await waitFor(() => expect(
      within(screen.getByRole("list", { name: "Skill 列表" })).getByText("current-skill"),
    ).toBeTruthy());
    stale.reject(new Error("stale load failed"));
    await Promise.resolve();

    expect(screen.queryByText("stale load failed")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Skill 列表" })).getByText("current-skill")).toBeTruthy();
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
