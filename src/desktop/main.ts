import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  screen,
  session,
  shell,
  utilityProcess,
  type MenuItemConstructorOptions,
  type UtilityProcess,
} from "electron";
import { DesktopRecoveryController } from "./lifecycle.js";
import {
  DESKTOP_PROTOCOL_VERSION,
  DESKTOP_SESSION_COOKIE,
  isDesktopHostMessage,
  safeDiagnostic,
  type DesktopHostMessage,
  type DesktopSafeDiagnostic,
} from "./protocol.js";
import { normalizeWindowState, type DesktopWindowState } from "./window-state.js";
import { parseOfficeRendererConsoleDiagnostic } from "./renderer-diagnostic.js";

const desktopDir = join(homedir(), ".agent-harness", "desktop");
const statePath = join(desktopDir, "window-state.json");
const logPath = join(desktopDir, "desktop.log");
const utilityEntry = fileURLToPath(new URL("./utility.js", import.meta.url));
const startupPage = fileURLToPath(new URL("./startup.html", import.meta.url));
const startupUrl = pathToFileURL(startupPage).href;
const recovery = new DesktopRecoveryController();

let window: BrowserWindow | null = null;
let utility: UtilityProcess | null = null;
let generation: string | null = null;
let sessionToken: string | null = null;
let workbenchOrigin: string | null = null;
let ready = false;
let quitting = false;
let shutdownPromise: Promise<void> | null = null;
let startupTimer: NodeJS.Timeout | null = null;
const pendingSnapshot = new Map<string, (state: "idle" | "active" | "attention" | "unknown") => void>();

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    focusWindow();
    const directory = findDirectoryArgument(argv);
    if (directory) void registerDirectory(directory);
  });
  app.whenReady().then(startApplication).catch((cause) => {
    void log("startup-failed", cause);
    app.exit(1);
  });
}

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  void requestShutdown("app-quit");
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") void requestShutdown("window-close");
});
app.on("activate", () => {
  if (window) focusWindow();
  else void createWindow();
});

async function startApplication(): Promise<void> {
  await mkdir(desktopDir, { recursive: true });
  app.setName("Beaver Code");
  Menu.setApplicationMenu(buildMenu());
  await createWindow();
  spawnWorkbench();
}

async function createWindow(): Promise<void> {
  const state = await readWindowState();
  const partition = `beaver-code-${randomUUID()}`;
  const browserSession = session.fromPartition(partition, { cache: false });
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  window = new BrowserWindow({
    ...state.bounds,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#ecf4f6",
    title: "Beaver Code",
    webPreferences: {
      session: browserSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });
  if (state.maximized) window.maximize();
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalUrl(url);
    return { action: "deny" };
  });
  window.webContents.on("console-message", (details) => {
    const diagnostic = parseOfficeRendererConsoleDiagnostic(details.message);
    if (diagnostic) void log("agent-office-renderer", diagnostic);
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedWorkbenchNavigation(url)) return;
    event.preventDefault();
    void openExternalUrl(url);
  });
  window.on("page-title-updated", (event) => {
    event.preventDefault();
    window?.setTitle("Beaver Code");
  });
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    void requestShutdown("window-close");
  });
  window.on("closed", () => { window = null; });
  window.on("resize", saveWindowStateSoon);
  window.on("move", saveWindowStateSoon);
  await window.loadFile(startupPage);
  window.once("ready-to-show", () => window?.show());
}

function spawnWorkbench(): void {
  const nextGeneration = randomUUID();
  const nextSessionToken = randomBytes(32).toString("base64url");
  generation = nextGeneration;
  sessionToken = nextSessionToken;
  ready = false;
  workbenchOrigin = null;
  recovery.begin(nextGeneration);
  const child = utilityProcess.fork(utilityEntry, [], { serviceName: "Beaver Code Workbench", stdio: "pipe" });
  utility = child;
  child.on("message", (message) => void receiveUtilityMessage(child, message));
  child.on("exit", (code) => void handleUtilityExit(child, code));
  child.on("spawn", () => child.postMessage({
    type: "bootstrap",
    protocolVersion: DESKTOP_PROTOCOL_VERSION,
    sessionToken: nextSessionToken,
    generation: nextGeneration,
  } satisfies DesktopHostMessage));
  child.stderr?.on("data", (chunk) => void log("utility-stderr", String(chunk).slice(0, 800)));
  startupTimer = setTimeout(() => showRecovery({
    stage: "startup",
    summary: "工作台启动超时。",
    recovery: "可以重新启动工作台或退出 Beaver Code。",
  }), 20_000);
}

async function receiveUtilityMessage(source: UtilityProcess, message: unknown): Promise<void> {
  if (source !== utility || !isDesktopHostMessage(message) || message.generation !== generation) return;
  if (message.type === "ready") {
    const origin = validateOrigin(message.origin);
    if (!origin || !window || !sessionToken) return;
    clearStartupTimer();
    ready = true;
    workbenchOrigin = origin;
    await window.webContents.session.cookies.set({
      url: origin,
      name: DESKTOP_SESSION_COOKIE,
      value: sessionToken,
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
    });
    await window.loadURL(origin);
    const smokeExitMs = Number(process.env.BEAVER_CODE_SMOKE_EXIT_MS ?? "");
    if (Number.isInteger(smokeExitMs) && smokeExitMs >= 250 && smokeExitMs <= 30_000) {
      setTimeout(() => void requestShutdown("app-quit"), smokeExitMs).unref();
    }
    return;
  }
  if (message.type === "startup-failed") {
    clearStartupTimer();
    await showRecovery(message.diagnostic);
    return;
  }
  if (message.type === "idle-lease-granted") {
    recovery.grantIdleLease(message.generation, message.leaseId);
    return;
  }
  if (message.type === "idle-lease-revoked") {
    recovery.revokeIdleLease(message.generation, message.leaseId);
    source.postMessage({
      type: "idle-lease-revoke-ack",
      generation: message.generation,
      leaseId: message.leaseId,
      requestId: message.requestId,
    } satisfies DesktopHostMessage);
    return;
  }
  if (message.type === "open-folder-request") {
    const options = {
      title: message.title || "选择项目文件夹",
      properties: ["openDirectory" as const],
    };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    source.postMessage({
      type: "open-folder-result",
      generation: message.generation,
      requestId: message.requestId,
      path: result.canceled ? null : result.filePaths[0] ?? null,
      canceled: result.canceled,
    } satisfies DesktopHostMessage);
    return;
  }
  if (message.type === "quit-snapshot") {
    pendingSnapshot.get(message.requestId)?.(message.state);
    pendingSnapshot.delete(message.requestId);
  }
}

async function handleUtilityExit(source: UtilityProcess, code: number): Promise<void> {
  if (source !== utility) return;
  clearStartupTimer();
  utility = null;
  if (quitting) return;
  const decision = recovery.unexpectedExit(generation ?? "", !ready);
  await log("utility-exit", `code=${code} decision=${decision}`);
  if (decision === "restart") {
    spawnWorkbench();
    return;
  }
  await showRecovery({
    stage: "runtime",
    summary: "工作台意外停止，为避免重复执行任务，Beaver Code 没有自动重启。",
    recovery: "请确认当前任务状态后手动重新启动工作台。",
  });
}

async function requestShutdown(reason: Extract<DesktopHostMessage, { type: "shutdown" }>["reason"]): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  quitting = true;
  shutdownPromise = (async () => {
    await saveWindowState();
    const child = utility;
    if (child && generation) {
      const requestId = randomUUID();
      await new Promise<void>((resolvePromise) => {
        const timer = setTimeout(() => {
          child.kill();
          resolvePromise();
        }, 8_500);
        const listener = (message: unknown) => {
          if (!isDesktopHostMessage(message) || message.type !== "shutdown-complete" || message.requestId !== requestId || message.generation !== generation) return;
          child.off("message", listener);
          clearTimeout(timer);
          if (message.diagnostic) void log("shutdown-diagnostic", message.diagnostic.summary);
          child.kill();
          resolvePromise();
        };
        child.on("message", listener);
        child.postMessage({ type: "shutdown", requestId, generation: generation!, reason, deadlineMs: 8_000 } satisfies DesktopHostMessage);
      });
    }
    window?.destroy();
    app.exit(0);
  })();
  return shutdownPromise;
}

async function showRecovery(diagnostic: DesktopSafeDiagnostic): Promise<void> {
  await log("recovery", diagnostic.summary);
  if (!window) return;
  const detail = [diagnostic.summary, diagnostic.recovery].filter(Boolean).join("\n\n");
  const choice = await dialog.showMessageBox(window, {
    type: "warning",
    title: "Beaver Code 需要处理",
    message: "工作台暂时无法使用",
    detail,
    buttons: ["重新启动工作台", "打开诊断目录", "退出 Beaver Code"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (choice.response === 0) {
    utility?.kill();
    spawnWorkbench();
  } else if (choice.response === 1) {
    await shell.openPath(desktopDir);
    await showRecovery(diagnostic);
  } else {
    await requestShutdown("host-failure");
  }
}

function buildMenu(): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "文件",
      submenu: [
        { label: "打开项目…", accelerator: "CmdOrCtrl+O", click: () => void requestOpenFolder() },
        { type: "separator" },
        { label: "关闭窗口", role: "close" },
        { label: "退出 Beaver Code", click: () => void requestShutdown("app-quit") },
      ],
    },
    { label: "编辑", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "视图", submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, ...(!app.isPackaged ? [{ role: "toggleDevTools" as const }] : [])] },
    { label: "帮助", submenu: [{ label: `Beaver Code ${app.getVersion()}`, enabled: false }, { label: "打开诊断目录", click: () => void shell.openPath(desktopDir) }] },
  ];
  return Menu.buildFromTemplate(template);
}

async function requestOpenFolder(): Promise<void> {
  const options = { title: "选择项目文件夹", properties: ["openDirectory" as const] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (!result.canceled && result.filePaths[0]) await registerDirectory(result.filePaths[0]);
}

async function registerDirectory(path: string): Promise<void> {
  if (!workbenchOrigin || !sessionToken || !existsSync(path) || !statSync(path).isDirectory()) {
    const options = { type: "info" as const, message: "无法打开这个文件夹。", detail: "请选择一个现有项目文件夹。" };
    if (window) await dialog.showMessageBox(window, options); else await dialog.showMessageBox(options);
    return;
  }
  const response = await fetch(`${workbenchOrigin}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `${DESKTOP_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`, Origin: workbenchOrigin },
    body: JSON.stringify({ path, confirm: true }),
  });
  if (!response.ok) {
    const options = { type: "warning" as const, message: "项目未能打开。", detail: "请在 Beaver Code 中检查项目设置后重试。" };
    if (window) await dialog.showMessageBox(window, options); else await dialog.showMessageBox(options);
    return;
  }
  const payload = await response.json() as { project?: { id?: string } };
  if (payload.project?.id) await window?.loadURL(`${workbenchOrigin}/?project=${encodeURIComponent(payload.project.id)}`);
}

function isAllowedWorkbenchNavigation(value: string): boolean {
  if (!workbenchOrigin) return value === startupUrl;
  try { return new URL(value).origin === workbenchOrigin; } catch { return false; }
}

async function openExternalUrl(value: string): Promise<void> {
  try {
    const url = new URL(value);
    if (["http:", "https:", "mailto:"].includes(url.protocol)) await shell.openExternal(url.toString());
  } catch { /* ignored */ }
}

function validateOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && Boolean(url.port) ? url.origin : null;
  } catch { return null; }
}

function focusWindow(): void {
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function findDirectoryArgument(argv: readonly string[]): string | null {
  for (const value of argv.slice(1)) {
    if (!value || value.startsWith("-") || value.includes(".asar")) continue;
    const candidate = resolve(value);
    try { if (statSync(candidate).isDirectory()) return candidate; } catch { /* ignored */ }
  }
  return null;
}

let saveTimer: NodeJS.Timeout | null = null;
function saveWindowStateSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveWindowState(), 300);
}

async function readWindowState(): Promise<DesktopWindowState> {
  let value: unknown = null;
  try { value = JSON.parse(await readFile(statePath, "utf8")); } catch { /* defaults */ }
  return normalizeWindowState(value, screen.getAllDisplays().map((display) => display.workArea));
}

async function saveWindowState(): Promise<void> {
  if (!window || window.isDestroyed()) return;
  const state: DesktopWindowState = { bounds: window.getNormalBounds(), maximized: window.isMaximized() };
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function clearStartupTimer(): void {
  if (startupTimer) clearTimeout(startupTimer);
  startupTimer = null;
}

async function log(event: string, detail: unknown): Promise<void> {
  await mkdir(desktopDir, { recursive: true });
  try {
    const info = await stat(logPath);
    if (info.size > 1_000_000) await rename(logPath, `${logPath}.previous`).catch(() => undefined);
  } catch { /* new log */ }
  const text = safeDiagnostic("runtime", detail).summary;
  await appendFile(logPath, `${new Date().toISOString()} ${event} ${text}\n`, "utf8");
}
