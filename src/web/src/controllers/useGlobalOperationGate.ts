import { useCallback, useRef, useState } from "react";

export interface WorkbenchOperationToken {
  id: number;
  key: string;
}

export interface WorkbenchOperationGateState {
  active: WorkbenchOperationToken | null;
  generation: number;
}

export function beginWorkbenchOperation(
  state: WorkbenchOperationGateState,
  key: string,
): { state: WorkbenchOperationGateState; token: WorkbenchOperationToken } {
  const token = { id: state.generation + 1, key };
  return { state: { active: token, generation: token.id }, token };
}

export function releaseWorkbenchOperation(
  state: WorkbenchOperationGateState,
  token: WorkbenchOperationToken,
): WorkbenchOperationGateState {
  return state.active?.id === token.id
    ? { ...state, active: null }
    : state;
}

export function invalidateWorkbenchOperation(state: WorkbenchOperationGateState): WorkbenchOperationGateState {
  return { active: null, generation: state.generation + 1 };
}

export function useGlobalOperationGate() {
  const [state, setState] = useState<WorkbenchOperationGateState>({ active: null, generation: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  const begin = useCallback((key: string): WorkbenchOperationToken => {
    const next = beginWorkbenchOperation(stateRef.current, key);
    stateRef.current = next.state;
    setState(next.state);
    return next.token;
  }, []);

  const release = useCallback((token: WorkbenchOperationToken): void => {
    const next = releaseWorkbenchOperation(stateRef.current, token);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const invalidate = useCallback((): void => {
    const next = invalidateWorkbenchOperation(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  const run = useCallback(async <T,>(key: string, operation: () => Promise<T>): Promise<T> => {
    const token = begin(key);
    try {
      return await operation();
    } finally {
      release(token);
    }
  }, [begin, release]);

  return {
    activeKey: state.active?.key ?? null,
    busy: state.active !== null,
    begin,
    release,
    invalidate,
    run,
  };
}
