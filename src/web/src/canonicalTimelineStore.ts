import type {
  CanonicalTimelineEnvelope,
  CanonicalTimelinePage,
  CanonicalTimelineScope,
  ParentAgentTranscript,
  ParentAgentTranscriptCell,
  ParentAgentTranscriptItem,
} from "./types.js";

export type { CanonicalTimelineEnvelope, CanonicalTimelinePage, CanonicalTimelineScope } from "./types.js";

export type CanonicalTimelinePaging = {
  limit: number;
  totalCount: number;
  hasMoreBefore: boolean;
  nextBeforeCursor?: string;
};

export type CanonicalTimelineRequestKind = "latest" | "before";

export type CanonicalTimelineMutationKind =
  | "none"
  | "append-tail"
  | "replace-tail-growth"
  | "prepend"
  | "calibrate"
  | "reset";

export type CanonicalTimelineMutation = {
  kind: CanonicalTimelineMutationKind;
  scopeKey: string;
  revision: number;
  addedMessageIds: string[];
  updatedMessageIds: string[];
  removedMessageIds: string[];
  ignored?: "duplicate" | "stale" | "request-generation" | "identity-conflict";
};

type CanonicalTimelineRequest = {
  generation: number;
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
};

type EnvelopeLane = "pinned" | "history" | "latest" | "realtime";

type StoredEnvelope = {
  envelope: CanonicalTimelineEnvelope;
  lane: EnvelopeLane;
};

export type CanonicalTimelineSurfaceState = {
  scope: CanonicalTimelineScope;
  watermark: number;
  envelopes: Record<string, StoredEnvelope>;
  paging?: CanonicalTimelinePaging;
  requests: Record<CanonicalTimelineRequestKind, CanonicalTimelineRequest>;
  lastMutation: CanonicalTimelineMutation;
};

export type CanonicalTimelineState = {
  surfaces: Record<string, CanonicalTimelineSurfaceState>;
  lastMutation: CanonicalTimelineMutation | null;
};

export type CanonicalTimelineAction =
  | { type: "envelope.received"; projectId: string; envelope: CanonicalTimelineEnvelope }
  | { type: "request.started"; scope: CanonicalTimelineScope; requestKind: CanonicalTimelineRequestKind; generation: number }
  | {
    type: "page.received";
    scope: CanonicalTimelineScope;
    requestKind: CanonicalTimelineRequestKind;
    generation: number;
    page: CanonicalTimelinePage;
  }
  | {
    type: "request.failed";
    scope: CanonicalTimelineScope;
    requestKind: CanonicalTimelineRequestKind;
    generation: number;
    error: string;
  }
  | { type: "scope.cleaned"; scope: CanonicalTimelineScope }
  | { type: "conversation.cleaned"; projectId: string; conversationId: string }
  | { type: "project.cleaned"; projectId: string }
  | { type: "store.cleaned" };

const DEFAULT_TITLE = "需求对话";
const DEFAULT_EMPTY_MESSAGE = "暂无对话内容。输入需求后，主 agent 会在这里持续回复。";

export function createCanonicalTimelineState(): CanonicalTimelineState {
  return { surfaces: {}, lastMutation: null };
}

export function canonicalTimelineScopeKey(scope: CanonicalTimelineScope): string {
  return JSON.stringify([scope.projectId, scope.conversationId, scope.agentSurfaceId]);
}

export function beginCanonicalTimelineRequest(
  state: CanonicalTimelineState,
  scope: CanonicalTimelineScope,
  requestKind: CanonicalTimelineRequestKind,
): { state: CanonicalTimelineState; generation: number } {
  const surface = state.surfaces[canonicalTimelineScopeKey(scope)] ?? emptySurface(scope);
  const generation = surface.requests[requestKind].generation + 1;
  return {
    generation,
    state: putSurface(state, {
      ...surface,
      requests: {
        ...surface.requests,
        [requestKind]: { generation, status: "loading" },
      },
    }),
  };
}

export function canonicalTimelineReducer(
  state: CanonicalTimelineState,
  action: CanonicalTimelineAction,
): CanonicalTimelineState {
  switch (action.type) {
    case "envelope.received":
      return receiveEnvelope(state, action.projectId, action.envelope);
    case "request.started":
      return startRequest(state, action.scope, action.requestKind, action.generation);
    case "page.received":
      return receivePage(state, action.scope, action.requestKind, action.generation, action.page);
    case "request.failed":
      return failRequest(state, action.scope, action.requestKind, action.generation, action.error);
    case "scope.cleaned":
      return cleanMatching(state, (scope) => sameScope(scope, action.scope));
    case "conversation.cleaned":
      return cleanMatching(state, (scope) => (
        scope.projectId === action.projectId && scope.conversationId === action.conversationId
      ));
    case "project.cleaned":
      return cleanMatching(state, (scope) => scope.projectId === action.projectId);
    case "store.cleaned":
      return Object.keys(state.surfaces).length === 0
        ? state
        : { surfaces: {}, lastMutation: cleanupMutation("*") };
  }
}

function startRequest(
  state: CanonicalTimelineState,
  scope: CanonicalTimelineScope,
  requestKind: CanonicalTimelineRequestKind,
  generation: number,
): CanonicalTimelineState {
  const surface = state.surfaces[canonicalTimelineScopeKey(scope)] ?? emptySurface(scope);
  if (generation <= surface.requests[requestKind].generation) return state;
  return putSurface(state, {
    ...surface,
    requests: {
      ...surface.requests,
      [requestKind]: { generation, status: "loading" },
    },
  });
}

export function selectCanonicalTimelineSurface(
  state: CanonicalTimelineState,
  scope: CanonicalTimelineScope,
): CanonicalTimelineSurfaceState | null {
  return state.surfaces[canonicalTimelineScopeKey(scope)] ?? null;
}

export function selectCanonicalTimelineEnvelopes(
  state: CanonicalTimelineState,
  scope: CanonicalTimelineScope,
): CanonicalTimelineEnvelope[] {
  const surface = selectCanonicalTimelineSurface(state, scope);
  return surface ? orderedStoredEnvelopes(surface).map(({ envelope }) => envelope) : [];
}

export function selectCanonicalTimelineTranscript(
  state: CanonicalTimelineState,
  scope: CanonicalTimelineScope,
): ParentAgentTranscript {
  const surface = selectCanonicalTimelineSurface(state, scope);
  const cells = surface
    ? orderedStoredEnvelopes(surface).flatMap(({ envelope }) => envelope.cells)
    : [];
  return {
    conversationId: scope.conversationId,
    title: DEFAULT_TITLE,
    cells,
    items: transcriptItemsFromCells(cells),
    emptyMessage: DEFAULT_EMPTY_MESSAGE,
    ...(surface?.paging ? { paging: surface.paging } : {}),
  };
}

function receiveEnvelope(
  state: CanonicalTimelineState,
  projectId: string,
  envelope: CanonicalTimelineEnvelope,
): CanonicalTimelineState {
  assertEnvelope(envelope);
  const scope = scopeForEnvelope(projectId, envelope);
  const key = canonicalTimelineScopeKey(scope);
  const surface = state.surfaces[key] ?? emptySurface(scope);
  const current = surface.envelopes[envelope.messageId];
  if (current && envelope.revision <= current.envelope.revision) {
    return withIgnoredMutation(
      state,
      surface,
      envelope.revision === current.envelope.revision ? "duplicate" : "stale",
    );
  }
  if (current && !sameOrderIdentity(current.envelope, envelope)) {
    return withIgnoredMutation(state, surface, "identity-conflict");
  }

  const nextSurface: CanonicalTimelineSurfaceState = {
    ...surface,
    watermark: Math.max(surface.watermark, envelope.revision),
    paging: surface.paging && !current
      ? { ...surface.paging, totalCount: surface.paging.totalCount + 1 }
      : surface.paging,
    envelopes: {
      ...surface.envelopes,
      [envelope.messageId]: {
        envelope: cloneEnvelope(envelope),
        lane: current?.lane ?? (isPinnedOrderClass(envelope.orderClass) ? "pinned" : "realtime"),
      },
    },
  };
  const orderedIds = orderedMessageIds(nextSurface);
  const mutationKind: CanonicalTimelineMutationKind = current
    ? orderedIds.at(-1) === envelope.messageId && envelopeContentExtent(envelope) > envelopeContentExtent(current.envelope)
      ? "replace-tail-growth"
      : "calibrate"
    : orderedIds.at(-1) === envelope.messageId
      ? "append-tail"
      : orderedIds[0] === envelope.messageId
        ? "prepend"
        : "calibrate";
  const mutation = mutationFor(
    key,
    mutationKind,
    nextSurface.watermark,
    current ? [] : [envelope.messageId],
    current ? [envelope.messageId] : [],
    [],
  );
  return putSurface(state, { ...nextSurface, lastMutation: mutation }, mutation);
}

function receivePage(
  state: CanonicalTimelineState,
  scope: CanonicalTimelineScope,
  requestKind: CanonicalTimelineRequestKind,
  generation: number,
  page: CanonicalTimelinePage,
): CanonicalTimelineState {
  assertPage(scope, page);
  const surface = state.surfaces[canonicalTimelineScopeKey(scope)] ?? emptySurface(scope);
  const request = surface.requests[requestKind];
  if (request.status !== "loading" || request.generation !== generation) {
    return withIgnoredMutation(state, surface, "request-generation");
  }
  return requestKind === "latest"
    ? receiveLatestPage(state, surface, generation, page)
    : receiveEarlierPage(state, surface, generation, page);
}

function receiveLatestPage(
  state: CanonicalTimelineState,
  surface: CanonicalTimelineSurfaceState,
  generation: number,
  page: CanonicalTimelinePage,
): CanonicalTimelineState {
  if (page.watermark < surface.watermark) {
    return receiveStaleLatestPage(state, surface, generation, page);
  }
  if (latestPageMatches(surface, page)) {
    const completed = completeRequest(surface, "latest", generation, page.paging);
    return withIgnoredMutation(state, completed, "duplicate");
  }

  const nextEnvelopes: Record<string, StoredEnvelope> = Object.fromEntries(
    Object.entries(surface.envelopes).filter(([, stored]) => stored.lane === "history"),
  );
  for (const [lane, envelopes] of [["pinned", page.pinned], ["latest", page.entries]] as const) {
    for (const envelope of envelopes) {
      const current = surface.envelopes[envelope.messageId];
      const accepted = current && current.envelope.revision > envelope.revision
        ? current.envelope
        : envelope;
      nextEnvelopes[envelope.messageId] = { envelope: cloneEnvelope(accepted), lane };
    }
  }

  const previousIds = new Set(Object.keys(surface.envelopes));
  const nextIds = new Set(Object.keys(nextEnvelopes));
  const added = [...nextIds].filter((messageId) => !previousIds.has(messageId));
  const removed = [...previousIds].filter((messageId) => !nextIds.has(messageId));
  const updated = [...nextIds].filter((messageId) => {
    const before = surface.envelopes[messageId];
    const after = nextEnvelopes[messageId];
    return before && after && after.envelope.revision > before.envelope.revision;
  });
  const mutation = mutationFor(
    canonicalTimelineScopeKey(surface.scope),
    Object.keys(surface.envelopes).length === 0 && added.length > 0
      ? "append-tail"
      : added.length || updated.length || removed.length ? "calibrate" : "none",
    page.watermark,
    added,
    updated,
    removed,
  );
  const next: CanonicalTimelineSurfaceState = {
    ...completeRequest(surface, "latest", generation, page.paging),
    watermark: page.watermark,
    envelopes: nextEnvelopes,
    lastMutation: mutation,
  };
  return putSurface(state, next, mutation);
}

function receiveEarlierPage(
  state: CanonicalTimelineState,
  surface: CanonicalTimelineSurfaceState,
  generation: number,
  page: CanonicalTimelinePage,
): CanonicalTimelineState {
  const envelopes = { ...surface.envelopes };
  const added: string[] = [];
  const updated: string[] = [];
  for (const [lane, incoming] of [["pinned", page.pinned], ["history", page.entries]] as const) {
    for (const envelope of incoming) {
      const current = envelopes[envelope.messageId];
      if (!current) {
        envelopes[envelope.messageId] = { envelope: cloneEnvelope(envelope), lane };
        added.push(envelope.messageId);
      } else if (envelope.revision > current.envelope.revision && sameOrderIdentity(current.envelope, envelope)) {
        envelopes[envelope.messageId] = {
          envelope: cloneEnvelope(envelope),
          lane: lane === "pinned" ? "pinned" : current.lane,
        };
        updated.push(envelope.messageId);
      }
    }
  }
  const mutation = mutationFor(
    canonicalTimelineScopeKey(surface.scope),
    added.length ? "prepend" : updated.length ? "calibrate" : "none",
    Math.max(surface.watermark, page.watermark),
    added,
    updated,
    [],
  );
  const next: CanonicalTimelineSurfaceState = {
    ...completeRequest(surface, "before", generation, page.paging),
    watermark: Math.max(surface.watermark, page.watermark),
    envelopes,
    lastMutation: mutation,
  };
  return putSurface(state, next, mutation);
}

function failRequest(
  state: CanonicalTimelineState,
  scope: CanonicalTimelineScope,
  requestKind: CanonicalTimelineRequestKind,
  generation: number,
  error: string,
): CanonicalTimelineState {
  const surface = state.surfaces[canonicalTimelineScopeKey(scope)];
  if (!surface
    || surface.requests[requestKind].generation !== generation
    || surface.requests[requestKind].status !== "loading") return state;
  return putSurface(state, {
    ...surface,
    requests: {
      ...surface.requests,
      [requestKind]: { generation, status: "error", error },
    },
  });
}

function completeRequest(
  surface: CanonicalTimelineSurfaceState,
  requestKind: CanonicalTimelineRequestKind,
  generation: number,
  paging?: CanonicalTimelinePaging,
): CanonicalTimelineSurfaceState {
  return {
    ...surface,
    ...(paging ? { paging: { ...paging } } : {}),
    requests: {
      ...surface.requests,
      [requestKind]: { generation, status: "ready" },
    },
  };
}

function cleanMatching(
  state: CanonicalTimelineState,
  matches: (scope: CanonicalTimelineScope) => boolean,
): CanonicalTimelineState {
  const removedKeys = Object.entries(state.surfaces)
    .filter(([, surface]) => matches(surface.scope))
    .map(([key]) => key);
  if (!removedKeys.length) return state;
  const surfaces = { ...state.surfaces };
  for (const key of removedKeys) delete surfaces[key];
  return { surfaces, lastMutation: cleanupMutation(removedKeys.join("|")) };
}

function putSurface(
  state: CanonicalTimelineState,
  surface: CanonicalTimelineSurfaceState,
  mutation: CanonicalTimelineMutation | null = state.lastMutation,
): CanonicalTimelineState {
  return {
    surfaces: { ...state.surfaces, [canonicalTimelineScopeKey(surface.scope)]: surface },
    lastMutation: mutation,
  };
}

function withIgnoredMutation(
  state: CanonicalTimelineState,
  surface: CanonicalTimelineSurfaceState,
  ignored: NonNullable<CanonicalTimelineMutation["ignored"]>,
): CanonicalTimelineState {
  const mutation: CanonicalTimelineMutation = {
    ...mutationFor(canonicalTimelineScopeKey(surface.scope), "none", surface.watermark, [], [], []),
    ignored,
  };
  return putSurface(state, { ...surface, lastMutation: mutation }, mutation);
}

function mutationFor(
  scopeKey: string,
  kind: CanonicalTimelineMutationKind,
  revision: number,
  addedMessageIds: string[],
  updatedMessageIds: string[],
  removedMessageIds: string[],
): CanonicalTimelineMutation {
  return { kind, scopeKey, revision, addedMessageIds, updatedMessageIds, removedMessageIds };
}

function cleanupMutation(scopeKey: string): CanonicalTimelineMutation {
  return mutationFor(scopeKey, "reset", 0, [], [], []);
}

function emptySurface(scope: CanonicalTimelineScope): CanonicalTimelineSurfaceState {
  const scopeKey = canonicalTimelineScopeKey(scope);
  return {
    scope: { ...scope },
    watermark: 0,
    envelopes: {},
    requests: {
      latest: { generation: 0, status: "idle" },
      before: { generation: 0, status: "idle" },
    },
    lastMutation: mutationFor(scopeKey, "none", 0, [], [], []),
  };
}

function orderedStoredEnvelopes(surface: CanonicalTimelineSurfaceState): StoredEnvelope[] {
  return Object.values(surface.envelopes).sort((left, right) => compareEnvelopes(left.envelope, right.envelope));
}

function orderedMessageIds(surface: CanonicalTimelineSurfaceState): string[] {
  return orderedStoredEnvelopes(surface).map(({ envelope }) => envelope.messageId);
}

function compareEnvelopes(left: CanonicalTimelineEnvelope, right: CanonicalTimelineEnvelope): number {
  return compareOrderClass(left.orderClass, right.orderClass)
    || left.position - right.position
    || left.messageId.localeCompare(right.messageId);
}

function compareOrderClass(left: CanonicalTimelineEnvelope["orderClass"], right: CanonicalTimelineEnvelope["orderClass"]): number {
  if (left === right) return 0;
  return left === "thread-start" ? -1 : 1;
}

function isPinnedOrderClass(orderClass: CanonicalTimelineEnvelope["orderClass"]): boolean {
  return orderClass === "thread-start";
}

function latestPageMatches(surface: CanonicalTimelineSurfaceState, page: CanonicalTimelinePage): boolean {
  if (page.watermark !== surface.watermark) return false;
  const currentPinned = Object.values(surface.envelopes).filter(({ lane }) => lane === "pinned");
  const currentLatest = Object.values(surface.envelopes).filter(({ lane }) => lane === "latest" || lane === "realtime");
  return envelopeSetsMatch(currentPinned, page.pinned) && envelopeSetsMatch(currentLatest, page.entries);
}

function envelopeSetsMatch(current: StoredEnvelope[], incoming: CanonicalTimelineEnvelope[]): boolean {
  if (current.length !== incoming.length) return false;
  const revisions = new Map(current.map(({ envelope }) => [envelope.messageId, envelope.revision]));
  return incoming.every((envelope) => revisions.get(envelope.messageId) === envelope.revision);
}

function assertPage(scope: CanonicalTimelineScope, page: CanonicalTimelinePage): void {
  if (page.conversationId !== scope.conversationId || page.agentSurfaceId !== scope.agentSurfaceId) {
    throw new Error("Timeline page scope does not match its requested surface.");
  }
  if (!Number.isSafeInteger(page.watermark) || page.watermark < 0) {
    throw new Error("Timeline page watermark must be a non-negative safe integer.");
  }
  const all = [...page.pinned, ...page.entries];
  const messageIds = new Set<string>();
  for (const envelope of all) {
    assertEnvelope(envelope);
    if (envelope.conversationId !== scope.conversationId || envelope.agentSurfaceId !== scope.agentSurfaceId) {
      throw new Error("Timeline envelope scope does not match its requested surface.");
    }
    if (envelope.revision > page.watermark) {
      throw new Error("Timeline page watermark must cover every envelope revision.");
    }
    if (messageIds.has(envelope.messageId)) {
      throw new Error(`Timeline page contains duplicate message id: ${envelope.messageId}.`);
    }
    messageIds.add(envelope.messageId);
  }
}

function assertEnvelope(envelope: CanonicalTimelineEnvelope): void {
  if (!envelope.conversationId || !envelope.agentSurfaceId || !envelope.messageId
    || !Number.isSafeInteger(envelope.position) || envelope.position <= 0
    || !Number.isSafeInteger(envelope.revision) || envelope.revision <= 0
    || (envelope.orderClass !== "sequence" && envelope.orderClass !== "thread-start")) {
    throw new Error("Timeline envelope identity, order, and revision must be canonical.");
  }
}

function receiveStaleLatestPage(
  state: CanonicalTimelineState,
  surface: CanonicalTimelineSurfaceState,
  generation: number,
  page: CanonicalTimelinePage,
): CanonicalTimelineState {
  const envelopes = { ...surface.envelopes };
  const added: string[] = [];
  const updated: string[] = [];
  for (const [lane, incoming] of [["pinned", page.pinned], ["latest", page.entries]] as const) {
    for (const envelope of incoming) {
      const current = envelopes[envelope.messageId];
      if (!current) {
        envelopes[envelope.messageId] = { envelope: cloneEnvelope(envelope), lane };
        added.push(envelope.messageId);
      } else if (envelope.revision > current.envelope.revision && sameOrderIdentity(current.envelope, envelope)) {
        envelopes[envelope.messageId] = { envelope: cloneEnvelope(envelope), lane: current.lane };
        updated.push(envelope.messageId);
      }
    }
  }
  const mutation = {
    ...mutationFor(
      canonicalTimelineScopeKey(surface.scope),
      added.length || updated.length ? "calibrate" : "none",
      surface.watermark,
      added,
      updated,
      [],
    ),
    ignored: "stale" as const,
  };
  const next = completeRequest(surface, "latest", generation, surface.paging ?? page.paging);
  return putSurface(state, { ...next, envelopes, lastMutation: mutation }, mutation);
}

function envelopeContentExtent(envelope: CanonicalTimelineEnvelope): number {
  return envelope.cells.reduce((total, cell) => total + cell.text.length + (cell.detailText?.length ?? 0), 0);
}

function sameOrderIdentity(left: CanonicalTimelineEnvelope, right: CanonicalTimelineEnvelope): boolean {
  return left.position === right.position && left.orderClass === right.orderClass;
}

function sameScope(left: CanonicalTimelineScope, right: CanonicalTimelineScope): boolean {
  return left.projectId === right.projectId
    && left.conversationId === right.conversationId
    && left.agentSurfaceId === right.agentSurfaceId;
}

function scopeForEnvelope(projectId: string, envelope: CanonicalTimelineEnvelope): CanonicalTimelineScope {
  return {
    projectId,
    conversationId: envelope.conversationId,
    agentSurfaceId: envelope.agentSurfaceId,
  };
}

function cloneEnvelope(envelope: CanonicalTimelineEnvelope): CanonicalTimelineEnvelope {
  return {
    ...envelope,
    cells: envelope.cells.map((cell) => ({ ...cell })),
  };
}

function transcriptItemsFromCells(cells: ParentAgentTranscriptCell[]): ParentAgentTranscriptItem[] {
  return cells
    .filter((cell) => cell.kind !== "detail-only")
    .map((cell) => ({
      id: `cell-item:${cell.id}`,
      actor: cell.kind === "user-message" ? "user" : "parent-agent",
      timestamp: cell.timestamp,
      derived: cell.source !== "provider-runtime" && cell.source !== "user",
      blocks: [{
        id: `cell-block:${cell.id}`,
        kind: cell.kind === "assistant-message" || cell.kind === "user-message"
          ? "prose"
          : cell.kind === "process-row"
            ? "process"
            : "evidence",
        source: cell.source,
        title: cell.title,
        text: cell.text,
        status: cell.status,
        evidenceRefs: cell.evidenceRefs,
        isError: cell.isError,
      }],
    }));
}
