import { randomUUID } from "node:crypto";
import { startWorkbenchServer, type WorkbenchServerHandle } from "../server/workbench-server.js";
import type { FolderDialogResult } from "../server/workbench/types.js";
import {
  DESKTOP_PROTOCOL_VERSION,
  DESKTOP_SESSION_COOKIE,
  isDesktopHostMessage,
  safeDiagnostic,
  type DesktopHostMessage,
} from "./protocol.js";

const hostPort = process.parentPort;
if (!hostPort) throw new Error("Beaver Code desktop host channel is unavailable.");

let generation: string | null = null;
let server: WorkbenchServerHandle | null = null;
let idleLeaseId: string | null = null;
let idleLeaseEpoch = 0;
let idleTimer: NodeJS.Timeout | null = null;
const folderRequests = new Map<string, (result: FolderDialogResult) => void>();
const leaseAcks = new Map<string, () => void>();

hostPort.on("message", (event) => {
  const message = event.data;
  if (!isDesktopHostMessage(message)) return;
  void receive(message);
});

async function receive(message: DesktopHostMessage): Promise<void> {
  if (message.type === "bootstrap") {
    if (generation !== null || server !== null) return;
    generation = message.generation;
    try {
      server = await startWorkbenchServer(null, {
        host: "127.0.0.1",
        port: 0,
        desktopHost: {
          sessionToken: message.sessionToken,
          cookieName: DESKTOP_SESSION_COOKIE,
          beforeSideEffect: revokeIdleLease,
          openFolder: requestFolder,
        },
      });
      post({
        type: "ready",
        protocolVersion: DESKTOP_PROTOCOL_VERSION,
        generation,
        origin: server.url,
      });
      void refreshIdleLease();
      idleTimer = setInterval(() => void refreshIdleLease(), 2_000);
      idleTimer.unref();
    } catch (cause) {
      post({
        type: "startup-failed",
        generation,
        diagnostic: safeDiagnostic("startup", cause, "请重新启动工作台。"),
      });
    }
    return;
  }
  if (message.generation !== generation) return;
  if (message.type === "open-folder-result") {
    const resolve = folderRequests.get(message.requestId);
    if (!resolve) return;
    folderRequests.delete(message.requestId);
    resolve({
      path: message.path,
      canceled: message.canceled,
      supported: true,
      ...(message.error ? { error: message.error } : {}),
    });
    return;
  }
  if (message.type === "idle-lease-revoke-ack") {
    const resolve = leaseAcks.get(message.requestId);
    if (!resolve || message.leaseId !== idleLeaseId) return;
    leaseAcks.delete(message.requestId);
    idleLeaseId = null;
    resolve();
    return;
  }
  if (message.type === "read-quit-snapshot") {
    const snapshot = server ? await server.snapshot() : {
      state: "unknown" as const,
      activeTurnCount: 0,
      activeTerminalCount: 0,
      pendingInteractionCount: 0,
    };
    post({ type: "quit-snapshot", requestId: message.requestId, generation, ...snapshot });
    return;
  }
  if (message.type === "shutdown") await shutdown(message);
}

async function refreshIdleLease(): Promise<void> {
  if (!server || !generation) return;
  const observedEpoch = idleLeaseEpoch;
  if ((await server.snapshot()).state !== "idle" || observedEpoch !== idleLeaseEpoch) return;
  idleLeaseId ??= randomUUID();
  post({ type: "idle-lease-granted", generation, leaseId: idleLeaseId });
}

async function revokeIdleLease(): Promise<void> {
  idleLeaseEpoch += 1;
  if (!generation || !idleLeaseId) return;
  const requestId = randomUUID();
  const leaseId = idleLeaseId;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      leaseAcks.delete(requestId);
      reject(new Error("Desktop idle lease acknowledgement timed out."));
    }, 2_000);
    leaseAcks.set(requestId, () => {
      clearTimeout(timer);
      resolve();
    });
    post({ type: "idle-lease-revoked", generation: generation!, leaseId, requestId });
  });
}

async function requestFolder(): Promise<FolderDialogResult> {
  if (!generation) return { path: null, canceled: false, supported: false, error: "桌面宿主尚未准备好。" };
  const requestId = randomUUID();
  return new Promise<FolderDialogResult>((resolve) => {
    const timer = setTimeout(() => {
      folderRequests.delete(requestId);
      resolve({ path: null, canceled: false, supported: true, error: "文件夹选择超时，请重试。" });
    }, 120_000);
    folderRequests.set(requestId, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
    post({ type: "open-folder-request", generation: generation!, requestId, title: "选择项目文件夹" });
  });
}

async function shutdown(message: Extract<DesktopHostMessage, { type: "shutdown" }>): Promise<void> {
  if (idleTimer) clearInterval(idleTimer);
  idleTimer = null;
  try {
    await server?.close(message.deadlineMs);
    server = null;
    post({ type: "shutdown-complete", requestId: message.requestId, generation: message.generation });
  } catch (cause) {
    post({
      type: "shutdown-complete",
      requestId: message.requestId,
      generation: message.generation,
      diagnostic: safeDiagnostic("shutdown", cause, "工作台已强制结束；下次启动会检查未完成任务。"),
    });
  }
}

function post(message: DesktopHostMessage): void {
  hostPort.postMessage(message);
}
