// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("offers a downloaded update without freezing the Workbench and lets the user postpone it", async () => {
    const { container } = render(<DesktopUpdateBoundary><input aria-label="草稿" /></DesktopUpdateBoundary>);
    await waitFor(() => expect(FakeEvents.current).not.toBeNull());
    act(() => FakeEvents.current!.dispatchEvent(new MessageEvent("offer", { data: JSON.stringify({
      offerId: "offer", version: "0.1.3", releaseUrl: "https://github.com/qinghui316/beaver-code/releases/tag/v0.1.3",
    }) })));
    expect(container.firstElementChild?.hasAttribute("inert")).toBe(false);
    expect(screen.getByText("Beaver Code 0.1.3 已准备好")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "稍后" }));
    await waitFor(() => expect(screen.queryByText("Beaver Code 0.1.3 已准备好")).toBeNull());
    expect(vi.mocked(fetch).mock.calls.some(([url, init]) => url === "/api/desktop/update/choice"
      && String(init?.body).includes('"action":"later"'))).toBe(true);
  });

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
