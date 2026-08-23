import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../api.js";
import type { ProductMode, ProjectProductModeActivitySnapshot } from "../types.js";

export interface ProductModeActivityControllerPorts {
  load?: (projectId: string) => Promise<ProjectProductModeActivitySnapshot>;
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface ProductModeActivityController {
  snapshot: ProjectProductModeActivitySnapshot | null;
  refresh: (projectId?: string) => Promise<void>;
  invalidate: (projectId: string) => void;
}

const INVALIDATION_DEBOUNCE_MS = 120;

export function useProductModeActivityController(
  projectId: string | null,
  productMode: ProductMode,
  ports: ProductModeActivityControllerPorts = {},
): ProductModeActivityController {
  const [snapshot, setSnapshot] = useState<ProjectProductModeActivitySnapshot | null>(null);
  const projectIdRef = useRef(projectId);
  const generationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portsRef = useRef(ports);
  projectIdRef.current = projectId;
  portsRef.current = ports;

  const refresh = useCallback(async (requestedProjectId?: string): Promise<void> => {
    const targetProjectId = requestedProjectId ?? projectIdRef.current;
    if (!targetProjectId || targetProjectId !== projectIdRef.current) return;
    const generation = generationRef.current;
    try {
      const load = portsRef.current.load ?? defaultLoad;
      const next = await load(targetProjectId);
      if (generationRef.current !== generation || projectIdRef.current !== targetProjectId || next.projectId !== targetProjectId) return;
      setSnapshot(next);
    } catch {
      // Keep the last canonical state until a later invalidation or reconnect succeeds.
    }
  }, []);

  const invalidate = useCallback((eventProjectId: string): void => {
    if (eventProjectId !== projectIdRef.current) return;
    if (timerRef.current !== null) (portsRef.current.clearTimer ?? clearTimeout)(timerRef.current);
    timerRef.current = (portsRef.current.setTimer ?? setTimeout)(() => {
      timerRef.current = null;
      void refresh(eventProjectId);
    }, INVALIDATION_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    generationRef.current += 1;
    if (timerRef.current !== null) {
      (portsRef.current.clearTimer ?? clearTimeout)(timerRef.current);
      timerRef.current = null;
    }
    setSnapshot((current) => current?.projectId === projectId ? current : null);
    if (!projectId) {
      return;
    }
    void refresh(projectId);
  }, [productMode, projectId, refresh]);

  useEffect(() => () => {
    generationRef.current += 1;
    if (timerRef.current !== null) (portsRef.current.clearTimer ?? clearTimeout)(timerRef.current);
  }, []);

  return {
    snapshot: snapshot?.projectId === projectId ? snapshot : null,
    refresh,
    invalidate,
  };
}

async function defaultLoad(projectId: string): Promise<ProjectProductModeActivitySnapshot> {
  return fetchJson<ProjectProductModeActivitySnapshot>(
    `/api/projects/${encodeURIComponent(projectId)}/workbench/mode-activity`,
  );
}
