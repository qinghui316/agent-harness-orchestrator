import spawn from "cross-spawn";
import { join } from "node:path";
import { z } from "zod";
import { getAhoHome } from "../fs/path.js";
import { readJsonFile, writeJsonFile } from "../fs/json.js";
import { codexRuntimeConfigArgs } from "./capabilities.js";
import { detectCodexAppServerCapability } from "./app-server.js";
import { readCodexConfigModelStatus } from "./trust.js";

export type CodexModelCandidateSource = "runtime" | "config" | "custom" | "selected";
export type CodexEffectiveModelSource = "selected" | "config" | "codex-default";

export interface CodexModelCandidate {
  id: string;
  model: string;
  label: string;
  source: CodexModelCandidateSource;
  isDefault?: boolean;
}

export interface CodexModelListStatus {
  available: boolean;
  degraded: boolean;
  degradedReason?: string;
  candidates: CodexModelCandidate[];
}

export interface CodexModelSettingsSnapshot {
  selectedModel: string | null;
  customModels: CodexModelCandidate[];
  configModel: string | null;
  configPath: string;
  configExists: boolean;
  configReason?: string;
  modelList: CodexModelListStatus;
  candidates: CodexModelCandidate[];
  effectiveModel: string | null;
  effectiveModelSource: CodexEffectiveModelSource;
}

const CustomModelSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  updatedAt: z.string(),
});

const RuntimeSettingsSchema = z.object({
  version: z.literal("1.0").default("1.0"),
  codex: z.object({
    selectedModel: z.string().nullable().optional(),
    customModels: z.array(CustomModelSchema).default([]),
  }).default({ selectedModel: null, customModels: [] }),
}).passthrough();

type RuntimeSettings = {
  version: "1.0";
  codex: {
    selectedModel?: string | null;
    customModels: Array<z.infer<typeof CustomModelSchema>>;
  };
};

export function normalizeCodexModelId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function readCodexModelSettings(): Promise<RuntimeSettings> {
  return readJsonFile(settingsPath(), RuntimeSettingsSchema as z.ZodType<RuntimeSettings>, { version: "1.0", codex: { selectedModel: null, customModels: [] } });
}

export async function setSelectedCodexModel(model: string | null): Promise<RuntimeSettings> {
  const settings = await readCodexModelSettings();
  const selectedModel = normalizeCodexModelId(model);
  const next = {
    ...settings,
    version: "1.0" as const,
    codex: {
      ...settings.codex,
      selectedModel,
    },
  };
  await writeJsonFile(settingsPath(), next);
  return next;
}

export async function addCustomCodexModel(model: string, label?: string): Promise<RuntimeSettings> {
  const id = normalizeCodexModelId(model);
  if (!id) throw new Error("model is required.");
  const settings = await readCodexModelSettings();
  const updatedAt = new Date().toISOString();
  const customModels = settings.codex.customModels.filter((item) => item.id !== id);
  customModels.push({ id, label: normalizeCodexModelId(label) ?? undefined, updatedAt });
  const next = {
    ...settings,
    version: "1.0" as const,
    codex: {
      ...settings.codex,
      customModels,
    },
  };
  await writeJsonFile(settingsPath(), next);
  return next;
}

export async function removeCustomCodexModel(model: string): Promise<RuntimeSettings> {
  const id = normalizeCodexModelId(model);
  if (!id) throw new Error("model is required.");
  const settings = await readCodexModelSettings();
  const next = {
    ...settings,
    version: "1.0" as const,
    codex: {
      ...settings.codex,
      selectedModel: settings.codex.selectedModel === id ? null : settings.codex.selectedModel ?? null,
      customModels: settings.codex.customModels.filter((item) => item.id !== id),
    },
  };
  await writeJsonFile(settingsPath(), next);
  return next;
}

export async function resolveCodexEffectiveModel(explicitModel?: string | null): Promise<{ model: string | null; source: CodexEffectiveModelSource }> {
  const explicit = normalizeCodexModelId(explicitModel);
  if (explicit) return { model: explicit, source: "selected" };
  const settings = await readCodexModelSettings();
  const selected = normalizeCodexModelId(settings.codex.selectedModel);
  if (selected) return { model: selected, source: "selected" };
  const config = await readCodexConfigModelStatus();
  if (config.model) return { model: config.model, source: "config" };
  return { model: null, source: "codex-default" };
}

export async function getCodexModelSettingsSnapshot(projectPath?: string): Promise<CodexModelSettingsSnapshot> {
  const [settings, configModel, runtimeModels] = await Promise.all([
    readCodexModelSettings(),
    readCodexConfigModelStatus(),
    listCodexRuntimeModels(projectPath),
  ]);
  const customModels = settings.codex.customModels.map((item): CodexModelCandidate => ({
    id: item.id,
    model: item.id,
    label: item.label?.trim() || item.id,
    source: "custom",
  }));
  const selectedModel = normalizeCodexModelId(settings.codex.selectedModel);
  const candidates = mergeCandidates([
    ...runtimeModels.candidates,
    ...(configModel.model ? [{ id: configModel.model, model: configModel.model, label: `${configModel.model} (config)`, source: "config" as const }] : []),
    ...customModels,
    ...(selectedModel ? [{ id: selectedModel, model: selectedModel, label: selectedModel, source: "selected" as const }] : []),
  ]);
  const effective = selectedModel
    ? { model: selectedModel, source: "selected" as const }
    : configModel.model
      ? { model: configModel.model, source: "config" as const }
      : { model: null, source: "codex-default" as const };
  return {
    selectedModel,
    customModels,
    configModel: configModel.model,
    configPath: configModel.configPath,
    configExists: configModel.configExists,
    configReason: configModel.reason,
    modelList: runtimeModels,
    candidates,
    effectiveModel: effective.model,
    effectiveModelSource: effective.source,
  };
}

export async function listCodexRuntimeModels(projectPath = process.cwd()): Promise<CodexModelListStatus> {
  const capability = await detectCodexAppServerCapability();
  if (!capability.available) {
    return { available: false, degraded: true, degradedReason: capability.errors.join(" ") || "Codex app-server is unavailable.", candidates: [] };
  }
  let child: ReturnType<typeof spawn> | null = null;
  let lineBuffer = "";
  let requestId = 1;
  const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  try {
    child = spawn("codex", [...codexRuntimeConfigArgs(), "app-server", "--listen", "stdio://"], {
      cwd: projectPath,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      lineBuffer += chunk.toString("utf8");
      drainLines();
    });
    child.stderr?.resume();
    child.on("error", (error: Error) => rejectAll(error));
    child.on("close", () => rejectAll(new Error("Codex app-server closed.")));
    await withTimeout(sendRequest("initialize", {
      capabilities: { experimentalApi: true },
      clientInfo: { name: "agent-harness-orchestrator", title: "Agent Harness Orchestrator", version: "0.1.0" },
    }), 3000, "Codex app-server initialize timed out.");
    sendNotification("initialized", {});
    const response = await withTimeout(sendRequest("model/list", {}), 3000, "Codex model_list timed out.");
    return { available: true, degraded: false, candidates: candidatesFromModelListResponse(response) };
  } catch (error) {
    return { available: false, degraded: true, degradedReason: error instanceof Error ? error.message : String(error), candidates: [] };
  } finally {
    for (const [, item] of pending) item.reject(new Error("Codex model_list finished."));
    pending.clear();
    try {
      child?.kill();
    } catch {
      // Best-effort cleanup.
    }
  }

  function sendRequest(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!child?.stdin?.writable) return Promise.reject(new Error("Codex app-server stdin is not writable."));
    const id = requestId++;
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }

  function sendNotification(method: string, params: Record<string, unknown>): void {
    if (child?.stdin?.writable) child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  function drainLines(): void {
    for (;;) {
      const index = lineBuffer.indexOf("\n");
      if (index < 0) return;
      const line = lineBuffer.slice(0, index).trim();
      lineBuffer = lineBuffer.slice(index + 1);
      if (!line) continue;
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (typeof payload.id !== "number" || !pending.has(payload.id)) continue;
      const handler = pending.get(payload.id);
      pending.delete(payload.id);
      if (isRecord(payload.error)) handler?.reject(new Error(JSON.stringify(payload.error)));
      else handler?.resolve(isRecord(payload.result) ? payload.result : payload);
    }
  }

  function rejectAll(error: Error): void {
    for (const [, item] of pending) item.reject(error);
    pending.clear();
  }
}

export function candidatesFromModelListResponse(response: unknown): CodexModelCandidate[] {
  const record = isRecord(response) ? response : {};
  const result = isRecord(record.result) ? record.result : record;
  const entries = Array.isArray(result.data) ? result.data : Array.isArray(record.data) ? record.data : [];
  return mergeCandidates(entries.map((entry): CodexModelCandidate | null => {
    if (!isRecord(entry)) return null;
    const model = normalizeCodexModelId(entry.model) ?? normalizeCodexModelId(entry.id);
    if (!model) return null;
    const label = normalizeCodexModelId(entry.displayName) ?? normalizeCodexModelId(entry.display_name) ?? model;
    return { id: normalizeCodexModelId(entry.id) ?? model, model, label, source: "runtime", isDefault: entry.isDefault === true || entry.is_default === true };
  }).filter((candidate): candidate is CodexModelCandidate => candidate !== null));
}

function mergeCandidates(candidates: CodexModelCandidate[]): CodexModelCandidate[] {
  const byModel = new Map<string, CodexModelCandidate>();
  for (const candidate of candidates) {
    const key = candidate.model.toLowerCase();
    const existing = byModel.get(key);
    if (!existing || candidate.source === "selected") byModel.set(key, candidate);
  }
  return [...byModel.values()];
}

function settingsPath(): string {
  return join(getAhoHome(), "settings.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
