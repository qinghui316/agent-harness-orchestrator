// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopUpdateBoundary } from "../../src/web/src/shell/DesktopUpdateBoundary.js";
import { rendererUpdateParticipants } from "../../src/web/src/controllers/RendererUpdateParticipants.js";

let unregister: (() => void) | undefined;
class FakeEvents extends EventTarget {
  static current: FakeEvents | null = null;
  onerror: (() => void) | null = null;
  constructor() { super(); FakeEvents.current = this; }
  close() {}
}
beforeEach(() => {
  FakeEvents.current = null;
  vi.stubGlobal("EventSource", FakeEvents);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(
    url === "/api/app/status" ? { desktopUpdates: true } : { accepted: true },
  ), { status: 200 })));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
});
afterEach(() => { unregister?.(); cleanup(); vi.unstubAllGlobals(); });
async function send(action: "prepare" | "confirm" | "cancel") {
  await act(async () => {
    FakeEvents.current!.dispatchEvent(new MessageEvent("update", { data: JSON.stringify({
      requestId: "request-" + action, connectionId: "connection",
      action, identity: { updateId: "update" },
    }) }));
  });
}
describe("desktop update save boundary", () => {
  it("freezes the surface until save acknowledgement and restores it on cancel", async () => {
    unregister = rendererUpdateParticipants.register(async () => () => true);
    const { container } = render(<DesktopUpdateBoundary><input aria-label="草稿" defaultValue="待保存内容" /></DesktopUpdateBoundary>);
    await waitFor(() => expect(FakeEvents.current).not.toBeNull());
    act(() => FakeEvents.current!.dispatchEvent(new MessageEvent("connected", { data: JSON.stringify({ connectionId: "connection" }) })));
    await send("prepare");
    expect(container.firstElementChild?.hasAttribute("inert")).toBe(true);
    expect(screen.getByRole("dialog").textContent).toContain("正在保存并更新");
    await send("confirm");
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => String(init?.body).includes('"ok":true'))).toBe(true);
    await send("cancel");
    expect(container.firstElementChild?.hasAttribute("inert")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getByLabelText("草稿") as HTMLInputElement).value).toBe("待保存内容");
  });
});
