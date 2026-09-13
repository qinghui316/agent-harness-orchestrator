import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { rendererUpdateParticipants } from "../controllers/RendererUpdateParticipants.js";

export function DesktopUpdateBoundary({ children }: { children: ReactNode }) {
  const [frozen, setFrozen] = useState(false);
  const [failed, setFailed] = useState(false);
  const notice = useRef<HTMLDialogElement>(null);
  const focusBeforeUpdate = useRef<HTMLElement | null>(null);
  const [offer, setOffer] = useState<{ offerId: string; version: string; releaseUrl: string } | null>(null);
  const [choosing, setChoosing] = useState(false);
  useLayoutEffect(() => {
    if (frozen && notice.current && !notice.current.open) notice.current.showModal();
    if (!frozen) focusBeforeUpdate.current?.focus();
  }, [frozen]);
  useEffect(() => {
    let disposed = false;
    let events: EventSource | null = null;
    let activeUpdate: string | null = null;
    let connectionId: string | null = null;
    let epoch = 0;
    const release = (): void => {
      activeUpdate = null;
      setFrozen(false);
    };
    void fetch("/api/app/status").then(async (response) => {
      if (!response.ok) return;
      const status = await response.json() as { desktopUpdates?: boolean };
      if (disposed || !status.desktopUpdates) return;
      events = new EventSource("/api/desktop/update/events");
      events.addEventListener("connected", (event) => {
        const value = JSON.parse((event as MessageEvent).data) as { connectionId?: string };
        connectionId = value.connectionId ?? null;
      });
      events.addEventListener("offer", (event) => {
        const value = JSON.parse((event as MessageEvent).data) as typeof offer;
        if (!disposed) { setOffer(value); setChoosing(false); }
      });
      events.addEventListener("update", (event) => {
        const myEpoch = ++epoch;
        void (async () => {
          const value = JSON.parse((event as MessageEvent).data) as {
            requestId?: string; connectionId?: string;
            action?: "prepare" | "confirm" | "cancel";
            identity?: { updateId?: string };
          };
          const updateId = value.identity?.updateId;
          if (!updateId || !value.requestId || value.connectionId !== connectionId || disposed) return;
          let ok = false;
          try {
            if (value.action === "cancel") {
              if (activeUpdate === updateId) {
                rendererUpdateParticipants.cancel(updateId);
                release();
              }
              ok = true;
            } else if (value.action === "prepare") {
              activeUpdate = updateId;
              focusBeforeUpdate.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              flushSync(() => { setFrozen(true); setFailed(false); });
              await rendererUpdateParticipants.prepare(updateId);
              ok = activeUpdate === updateId && rendererUpdateParticipants.confirm(updateId);
            } else if (value.action === "confirm") {
              ok = activeUpdate === updateId && rendererUpdateParticipants.confirm(updateId);
            }
          } catch { ok = false; }
          if (disposed || epoch !== myEpoch) return;
          const ack = await fetch("/api/desktop/update/ack", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ requestId: value.requestId, connectionId, ok }),
          });
          if (!ack.ok && activeUpdate) setFailed(true);
        })().catch(() => { if (!disposed && activeUpdate) setFailed(true); });
      });
      events.onerror = () => {
        epoch += 1;
        if (activeUpdate) setFailed(true);
      };
    }).catch(() => { /* Update discovery must not prevent normal Web startup. */ });
    return () => { disposed = true; epoch += 1; events?.close(); };
  }, []);

  const choose = async (action: "install" | "later"): Promise<void> => {
    if (!offer || choosing) return;
    setChoosing(true);
    try {
      const response = await fetch("/api/desktop/update/choice", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ offerId: offer.offerId, action }),
      });
      if (!response.ok) throw new Error("choice rejected");
      setOffer(null);
    } catch { setChoosing(false); }
  };

  return <>
    <div inert={frozen} aria-busy={frozen || undefined}>{children}</div>
    {offer && !frozen && <aside className="desktop-update-offer" role="status" aria-label="Beaver Code 更新已准备好">
      <div><strong>Beaver Code {offer.version} 已准备好</strong><span>重新启动后完成更新。</span></div>
      <div className="desktop-update-offer-actions">
        <button type="button" disabled={choosing} onClick={() => void choose("later")}>稍后</button>
        <a href={offer.releaseUrl} target="_blank" rel="noreferrer">查看更新说明</a>
        <button type="button" disabled={choosing} onClick={() => void choose("install")}>重新启动并更新</button>
      </div>
    </aside>}
    {frozen && <dialog ref={notice} className="desktop-update-notice" aria-labelledby="desktop-update-title" aria-modal="true"
      onCancel={(event) => event.preventDefault()}>
      <strong id="desktop-update-title" role={failed ? "alert" : "status"}>{failed ? "更新暂未完成" : "正在保存并更新…"}</strong>
      <p>{failed ? "请在帮助菜单中查看诊断，或重新启动工作台。" : "保存完成后将自动重启 Beaver Code。"}</p>
    </dialog>}
  </>;
}
