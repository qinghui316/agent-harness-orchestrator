// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsSurface } from "../../src/web/src/panels/SettingsSurface.js";
import type { ProviderCapabilitySnapshot } from "../../src/web/src/types.js";

afterEach(cleanup);

describe("SettingsSurface clarity", () => {
  it("normalizes legacy sections into the two user-facing destinations", () => {
    render(<SettingsSurface section="basic" onSectionChange={vi.fn()} project={null} productMode="agent" conversationId={null} selectedProviderId="codex" diagnostics={null} modelSettings={null} providerCapabilities={[]} onClose={vi.fn()} onRefresh={vi.fn()} />);
    const navigation = screen.getByRole("navigation");
    expect(navigation.querySelectorAll("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "模型与服务" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skills" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "基础" })).toBeNull();
    expect(screen.queryByRole("button", { name: "项目" })).toBeNull();
  });

  it("keeps capability keys inside diagnostics and only reveals them for degraded state", () => {
    const view = render(<SettingsSurface section="provider" onSectionChange={vi.fn()} project={null} productMode="agent" conversationId={null} selectedProviderId="codex" diagnostics={null} modelSettings={null} providerCapabilities={[snapshot("ready")]} onClose={vi.fn()} onRefresh={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "查看诊断" })).toBeNull();
    expect(screen.queryByText("turn.review")).toBeNull();

    view.rerender(<SettingsSurface section="provider" onSectionChange={vi.fn()} project={null} productMode="agent" conversationId={null} selectedProviderId="codex" diagnostics={null} modelSettings={null} providerCapabilities={[snapshot("degraded")]} onClose={vi.fn()} onRefresh={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "查看诊断" }));
    expect(screen.getByRole("dialog", { name: "服务诊断" })).toBeTruthy();
    expect(screen.getByText("turn.review")).toBeTruthy();
  });
});

function snapshot(status: ProviderCapabilitySnapshot["status"]): ProviderCapabilitySnapshot {
  return {
    providerId: "codex",
    displayName: "Codex",
    productMode: "agent",
    status,
    runnable: true,
    checkedAt: "2026-09-04T00:00:00.000Z",
    snapshotHash: `snapshot-${status}`,
    snapshotVersion: 1,
    effectiveModel: "gpt-test",
    effectiveModelSource: "provider-default",
    degradedReasons: status === "degraded" ? ["Review unavailable"] : [],
    capabilities: [{ key: "turn.review", label: "Code Review", spec: "supported", runtime: status === "ready" ? "ready" : "degraded", summary: "Review support" }],
  };
}
