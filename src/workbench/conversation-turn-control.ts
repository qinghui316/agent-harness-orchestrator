import type { ProductMode, ProviderId } from "../provider-runtime/index.js";
import type { ActiveProviderTurn, ProviderTurnStartedIdentity } from "../provider-runtime/contracts.js";
import type { ProviderRegistry } from "../provider-runtime/registry.js";
import type { ProjectRuntimeCoordinatorPort } from "../project-runtime/coordinator.js";
import type { ManagedProject } from "../types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { publishConversationTurnControlInvalidated } from "./project-live-events.js";

export interface ConversationTurnInterruptRequest {
  projectId: string;
  productMode: ProductMode;
  conversationId: string;
  providerId: ProviderId;
  expectedAttemptId: string;
}

export type ConversationTurnInterruptReceipt =
  | { status: "pending" | "interrupt-requested"; attemptId: string; runId: string }
  | { status: "already-terminal"; attemptId: string; runId?: string };

export interface ConversationTurnControlState {
  state: "idle" | "running" | "stopping";
  canInterrupt: boolean;
  providerId?: ProviderId;
  attemptId?: string;
  runId?: string;
}

export interface ConversationTurnRegistration extends ConversationTurnInterruptRequest {
  graphScopeId: string;
  runId: string;
  roleId: "main-agent";
}

type ControlEntry = {
  registration: ConversationTurnRegistration;
  started: ProviderTurnStartedIdentity | null;
  phase: "running" | "pending" | "submitting";
  submission: Promise<ConversationTurnInterruptReceipt> | null;
};

export class ConversationTurnControlOwner {
  private readonly entries = new Map<string, ControlEntry>();

  constructor(private readonly options: {
    providerRegistry: ProviderRegistry;
    projectRuntimeCoordinator: Pick<ProjectRuntimeCoordinatorPort, "resolve">;
    onInvalidated?: (projectId: string, data: { conversationId: string; attemptId: string }) => void;
  }) {}

  registerAttempt(registration: ConversationTurnRegistration): void {
    const key = controlKey(registration.projectId, registration.conversationId);
    const current = this.entries.get(key);
    if (current && !sameRegistration(current.registration, registration)) {
      throw conflict("Conversation Turn control is already registered with different Turn identity.");
    }
    this.entries.set(key, current ?? { registration: { ...registration }, started: null, phase: "running", submission: null });
    this.invalidate(registration);
  }

  onTurnStarted = (identity: ProviderTurnStartedIdentity): void => {
    if (!identity.conversationId) return;
    const entry = this.entries.get(controlKey(identity.projectId, identity.conversationId));
    if (!entry || !sameStartedIdentity(entry.registration, identity)) return;
    entry.started = { ...identity };
    if (entry.phase === "pending") void this.submit(entry).catch(() => undefined);
  };

  release(registration: ConversationTurnRegistration): void {
    const key = controlKey(registration.projectId, registration.conversationId);
    const current = this.entries.get(key);
    if (!current || current.registration.expectedAttemptId !== registration.expectedAttemptId) return;
    this.entries.delete(key);
    this.invalidate(registration);
  }

  state(projectId: string, conversationId: string, expectedAttemptId?: string): ConversationTurnControlState {
    const entry = this.entries.get(controlKey(projectId, conversationId));
    if (!entry || (expectedAttemptId && entry.registration.expectedAttemptId !== expectedAttemptId)) {
      return { state: "idle", canInterrupt: false };
    }
    return {
      state: entry.phase === "running" ? "running" : "stopping",
      canInterrupt: true,
      providerId: entry.registration.providerId,
      attemptId: entry.registration.expectedAttemptId,
      runId: entry.registration.runId,
    };
  }

  async interrupt(project: ManagedProject, request: ConversationTurnInterruptRequest): Promise<ConversationTurnInterruptReceipt> {
    if (project.id !== request.projectId) throw conflict("Interrupt project identity does not match the selected project.");
    const runtime = await this.options.projectRuntimeCoordinator.resolve(project);
    const paths = runtime.state === "onboarding" ? runtime.paths : runtime.resolution.paths;
    const database = await openProjectRuntimeWorkbenchDatabase(paths, { providerRegistry: this.options.providerRegistry });
    try {
      const conversation = database.conversations.readConversation(paths.projectId, request.conversationId);
      const attempt = database.providerAttempts.readProviderAttempt(paths.projectId, request.expectedAttemptId);
      if (!conversation || conversation.deletedAt) throw notFound("Conversation not found.");
      if (conversation.productMode !== request.productMode
        || conversation.selectedProviderId !== request.providerId
        || attempt?.projectId !== paths.projectId
        || attempt.conversationId !== conversation.conversationId
        || attempt.productMode !== request.productMode
        || attempt.providerId !== request.providerId
        || attempt.roleId !== "main-agent"
        || attempt.graphScopeId !== conversation.currentGraphScopeId) {
        throw conflict("Interrupt request does not match the current Conversation and main Attempt.");
      }
      const entry = this.entries.get(controlKey(paths.projectId, conversation.conversationId));
      if (attempt.status !== "queued" && attempt.status !== "running") {
        const durableLink = database.providerAttempts
          .listProviderThreads(paths.projectId, conversation.conversationId)
          .find((candidate) => candidate.attemptId === attempt.attemptId
            && candidate.providerId === attempt.providerId
            && candidate.roleId === "main-agent"
            && candidate.graphScopeId === attempt.graphScopeId);
        const runId = durableLink?.runId
          ?? (entry && sameRequest(entry.registration, request) ? entry.registration.runId : undefined);
        return {
          status: "already-terminal",
          attemptId: attempt.attemptId,
          ...(runId ? { runId } : {}),
        };
      }
      if (!entry || !sameRequest(entry.registration, request)) {
        throw conflict("The requested Attempt is not owned by a current-process Provider Turn.");
      }
      if (attempt.nativeSessionId && entry.started && attempt.nativeSessionId !== entry.started.sessionId) {
        throw conflict("The durable Provider Session does not match the started Turn identity.");
      }
      if (entry.phase === "pending") {
        return { status: "pending", attemptId: request.expectedAttemptId, runId: entry.registration.runId };
      }
      if (entry.submission) return entry.submission;
      const active = this.exactActiveTurn(entry.registration);
      if (!active) {
        entry.phase = "pending";
        this.invalidate(entry.registration);
        return { status: "pending", attemptId: request.expectedAttemptId, runId: entry.registration.runId };
      }
      return this.submit(entry, active);
    } finally {
      database.close();
    }
  }

  private submit(entry: ControlEntry, knownActive?: ActiveProviderTurn): Promise<ConversationTurnInterruptReceipt> {
    if (entry.submission) return entry.submission;
    const active = knownActive ?? this.exactActiveTurn(entry.registration);
    if (!active) {
      entry.phase = "pending";
      this.invalidate(entry.registration);
      return Promise.resolve({
        status: "pending",
        attemptId: entry.registration.expectedAttemptId,
        runId: entry.registration.runId,
      });
    }
    entry.phase = "submitting";
    this.invalidate(entry.registration);
    entry.submission = active.interrupt("User requested interrupt from the owning Conversation.")
      .then((result) => result.status === "already-terminal"
        ? {
          status: "already-terminal" as const,
          attemptId: entry.registration.expectedAttemptId,
          runId: entry.registration.runId,
        }
        : {
          status: "interrupt-requested" as const,
          attemptId: entry.registration.expectedAttemptId,
          runId: entry.registration.runId,
        })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "ProviderInterruptRejected") {
          entry.phase = "running";
          entry.submission = null;
          this.invalidate(entry.registration);
        }
        throw error;
      });
    return entry.submission;
  }

  private exactActiveTurn(registration: ConversationTurnRegistration): ActiveProviderTurn | null {
    const entry = this.entries.get(controlKey(registration.projectId, registration.conversationId));
    const started = entry?.started;
    if (!started) return null;
    const active = this.options.providerRegistry.findActiveTurn(registration.conversationId);
    if (!active) return null;
    if (active.providerId !== registration.providerId
      || active.runtimeScopeId !== registration.conversationId
      || active.attemptId !== registration.expectedAttemptId
      || active.runId !== registration.runId
      || active.roleId !== registration.roleId
      || active.session.sessionId !== started.sessionId
      || active.turnId !== started.turnId) {
      throw conflict("Active Provider Turn does not match the registered Conversation Attempt.");
    }
    return active;
  }

  private invalidate(registration: ConversationTurnRegistration): void {
    (this.options.onInvalidated ?? publishConversationTurnControlInvalidated)(registration.projectId, {
      conversationId: registration.conversationId,
      attemptId: registration.expectedAttemptId,
    });
  }
}

function sameRequest(registration: ConversationTurnRegistration, request: ConversationTurnInterruptRequest): boolean {
  return registration.projectId === request.projectId
    && registration.productMode === request.productMode
    && registration.conversationId === request.conversationId
    && registration.providerId === request.providerId
    && registration.expectedAttemptId === request.expectedAttemptId;
}

function sameRegistration(left: ConversationTurnRegistration, right: ConversationTurnRegistration): boolean {
  return sameRequest(left, right)
    && left.graphScopeId === right.graphScopeId
    && left.runId === right.runId
    && left.roleId === right.roleId;
}

function sameStartedIdentity(registration: ConversationTurnRegistration, identity: ProviderTurnStartedIdentity): boolean {
  return registration.projectId === identity.projectId
    && registration.conversationId === identity.conversationId
    && registration.providerId === identity.providerId
    && registration.expectedAttemptId === identity.attemptId
    && registration.runId === identity.runId
    && registration.roleId === identity.roleId
    && identity.runtimeScopeId === registration.conversationId;
}

function controlKey(projectId: string, conversationId: string): string {
  return `${projectId}\0${conversationId}`;
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}

function notFound(message: string): Error {
  const error = new Error(message);
  error.name = "NotFound";
  return error;
}
