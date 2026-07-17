import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson, postJson } from "../api.js";
import type {
  ProviderCapabilitySnapshot,
  ProviderDiagnostics,
  ProviderModelSettingsSnapshot,
} from "../types.js";

export interface ProviderConfigurationInput {
  projectId: string | null;
  projectDefaultProviderId: string | null;
  conversationProviderId: string | null;
  onError(message: string): void;
}

export function useProviderConfigurationController(input: ProviderConfigurationInput) {
  const [diagnostics, setDiagnostics] = useState<ProviderDiagnostics | null>(null);
  const [modelSettings, setModelSettings] = useState<ProviderModelSettingsSnapshot | null>(null);
  const [capabilities, setCapabilities] = useState<ProviderCapabilitySnapshot[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSettingsBusy, setModelSettingsBusy] = useState(false);
  const [modelSettingsMessage, setModelSettingsMessage] = useState<string | null>(null);
  const requestGenerationRef = useRef(0);
  const selectedProviderIdRef = useRef<string | null>(null);
  selectedProviderIdRef.current = selectedProviderId;

  const providerPath = useCallback((providerId: string, leaf: "diagnostics" | "models") => (
    input.projectId
      ? `/api/projects/${encodeURIComponent(input.projectId)}/providers/${encodeURIComponent(providerId)}/${leaf}`
      : `/api/providers/${encodeURIComponent(providerId)}/${leaf}`
  ), [input.projectId]);

  const loadProviderDetails = useCallback(async (providerId: string, generation = requestGenerationRef.current): Promise<void> => {
    const [rawDiagnostics, rawModels] = await Promise.all([
      fetchJson<unknown>(providerPath(providerId, "diagnostics")),
      fetchJson<unknown>(providerPath(providerId, "models")),
    ]);
    if (generation !== requestGenerationRef.current) return;
    setDiagnostics(isProviderDiagnostics(rawDiagnostics) ? rawDiagnostics : null);
    setModelSettings(isProviderModelSettingsSnapshot(rawModels) ? rawModels : null);
  }, [providerPath]);

  const reload = useCallback(async (): Promise<void> => {
    const generation = ++requestGenerationRef.current;
    const path = input.projectId
      ? `/api/projects/${encodeURIComponent(input.projectId)}/providers/capabilities`
      : "/api/providers/capabilities";
    const payload = await fetchJson<{ providers?: unknown[] }>(path);
    if (generation !== requestGenerationRef.current) return;
    const nextCapabilities = Array.isArray(payload.providers)
      ? payload.providers.filter(isProviderCapabilitySnapshot)
      : [];
    setCapabilities(nextCapabilities);
    const providerId = selectEffectiveProviderId({
      conversationProviderId: input.conversationProviderId,
      projectDefaultProviderId: input.projectDefaultProviderId,
      selectedProviderId: selectedProviderIdRef.current,
      capabilities: nextCapabilities,
    });
    setSelectedProviderId(providerId);
    if (!providerId) {
      setDiagnostics(null);
      setModelSettings(null);
      return;
    }
    await loadProviderDetails(providerId, generation);
  }, [input.conversationProviderId, input.projectDefaultProviderId, input.projectId, loadProviderDetails]);

  useEffect(() => {
    reload().catch((cause: unknown) => input.onError(cause instanceof Error ? cause.message : String(cause)));
    return () => { requestGenerationRef.current += 1; };
  }, [reload, input.onError]);

  useEffect(() => {
    setModelSettingsBusy(false);
    setModelSettingsMessage(null);
  }, [input.projectId]);

  useEffect(() => {
    const providerId = selectEffectiveProviderId({
      conversationProviderId: input.conversationProviderId,
      projectDefaultProviderId: input.projectDefaultProviderId,
      selectedProviderId,
      capabilities,
    });
    if (providerId !== selectedProviderId) setSelectedProviderId(providerId);
  }, [capabilities, input.conversationProviderId, input.projectDefaultProviderId, selectedProviderId]);

  const selectProvider = useCallback(async (providerId: string): Promise<void> => {
    if (providerId === selectedProviderId) return;
    const generation = ++requestGenerationRef.current;
    setSelectedProviderId(providerId);
    await loadProviderDetails(providerId, generation);
  }, [loadProviderDetails, selectedProviderId]);

  const openModelPicker = useCallback(async (): Promise<void> => {
    const generation = ++requestGenerationRef.current;
    setModelPickerOpen(true);
    setModelSettingsMessage(null);
    const providerId = selectedProviderId ?? await resolveOnlyProviderId();
    if (generation !== requestGenerationRef.current) return;
    try {
      await loadProviderDetails(providerId, generation);
    } catch (cause) {
      if (generation === requestGenerationRef.current) {
        setModelSettingsMessage(cause instanceof Error ? cause.message : String(cause));
      }
    }
  }, [loadProviderDetails, selectedProviderId]);

  const updateModelSettings = useCallback(async (body: unknown): Promise<void> => {
    const generation = ++requestGenerationRef.current;
    setModelSettingsBusy(true);
    setModelSettingsMessage(null);
    try {
      const providerId = selectedProviderId ?? await resolveOnlyProviderId();
      if (generation !== requestGenerationRef.current) return;
      const raw = await postJson<unknown>(providerPath(providerId, "models"), body);
      if (generation !== requestGenerationRef.current) return;
      setModelSettings(isProviderModelSettingsSnapshot(raw) ? raw : null);
      const capabilitiesPath = input.projectId
        ? `/api/projects/${encodeURIComponent(input.projectId)}/providers/capabilities`
        : "/api/providers/capabilities";
      const [rawDiagnostics, capabilityPayload] = await Promise.all([
        fetchJson<unknown>(providerPath(providerId, "diagnostics")),
        fetchJson<{ providers?: unknown[] }>(capabilitiesPath),
      ]);
      if (generation === requestGenerationRef.current) {
        setDiagnostics(isProviderDiagnostics(rawDiagnostics) ? rawDiagnostics : null);
        setCapabilities(Array.isArray(capabilityPayload.providers)
          ? capabilityPayload.providers.filter(isProviderCapabilitySnapshot)
          : []);
      }
    } catch (cause) {
      if (generation === requestGenerationRef.current) {
        setModelSettingsMessage(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (generation === requestGenerationRef.current) setModelSettingsBusy(false);
    }
  }, [input.projectId, providerPath, selectedProviderId]);

  return {
    diagnostics,
    modelSettings,
    capabilities,
    selectedProviderId,
    modelPickerOpen,
    modelSettingsBusy,
    modelSettingsMessage,
    selectProvider,
    openModelPicker,
    closeModelPicker: () => setModelPickerOpen(false),
    updateModelSettings,
    reload,
  };
}

export function selectEffectiveProviderId(input: {
  conversationProviderId: string | null;
  projectDefaultProviderId: string | null;
  selectedProviderId: string | null;
  capabilities: ProviderCapabilitySnapshot[];
}): string | null {
  const available = new Set(input.capabilities.map((provider) => provider.providerId));
  if (input.conversationProviderId && available.has(input.conversationProviderId)) return input.conversationProviderId;
  if (input.selectedProviderId && available.has(input.selectedProviderId)) return input.selectedProviderId;
  if (input.projectDefaultProviderId && available.has(input.projectDefaultProviderId)) return input.projectDefaultProviderId;
  return input.capabilities.length === 1 ? input.capabilities[0]!.providerId : null;
}

export function isProviderDiagnostics(value: unknown): value is ProviderDiagnostics {
  if (!value || typeof value !== "object") return false;
  const diagnostics = value as Partial<ProviderDiagnostics>;
  return typeof diagnostics.providerId === "string"
    && typeof diagnostics.displayName === "string"
    && typeof diagnostics.installation === "object"
    && diagnostics.installation !== null
    && typeof diagnostics.models === "object"
    && diagnostics.models !== null;
}

export function isProviderModelSettingsSnapshot(value: unknown): value is ProviderModelSettingsSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ProviderModelSettingsSnapshot>;
  return typeof snapshot.providerId === "string"
    && (snapshot.effectiveModel === null || typeof snapshot.effectiveModel === "object")
    && (snapshot.effectiveModelSource === "selected" || snapshot.effectiveModelSource === "config" || snapshot.effectiveModelSource === "provider-default")
    && Array.isArray(snapshot.candidates)
    && typeof snapshot.available === "boolean";
}

export function isProviderCapabilitySnapshot(value: unknown): value is ProviderCapabilitySnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ProviderCapabilitySnapshot>;
  return typeof snapshot.providerId === "string"
    && snapshot.productMode === "harness"
    && (snapshot.status === "ready" || snapshot.status === "degraded" || snapshot.status === "unavailable")
    && typeof snapshot.runnable === "boolean"
    && typeof snapshot.snapshotHash === "string"
    && typeof snapshot.snapshotVersion === "number"
    && Array.isArray(snapshot.capabilities);
}

async function resolveOnlyProviderId(): Promise<string> {
  const payload = await fetchJson<{ providers?: Array<{ providerId?: string }> }>("/api/providers");
  const providers = (payload.providers ?? []).filter((provider): provider is { providerId: string } => typeof provider.providerId === "string");
  if (providers.length === 0) throw new Error("没有可用的 Agent provider。");
  if (providers.length > 1) throw new Error("当前存在多个 Agent provider，请先选择当前 provider。");
  return providers[0]!.providerId;
}
