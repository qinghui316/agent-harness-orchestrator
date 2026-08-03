import type { ActiveProviderTurn, ProviderDescriptor } from "./contracts.js";
import { missingProviderCapabilities, type ProviderCapabilitySnapshot, type ProviderId, type ProviderOperationProfile } from "./types.js";

export class ProviderRegistry {
  private readonly descriptors = new Map<ProviderId, ProviderDescriptor>();

  register(descriptor: ProviderDescriptor): void {
    if (this.descriptors.has(descriptor.id)) throw new Error(`Provider already registered: ${descriptor.id}`);
    this.descriptors.set(descriptor.id, descriptor);
  }

  get(providerId: ProviderId): ProviderDescriptor {
    const descriptor = this.descriptors.get(providerId);
    if (!descriptor) throw new Error(`Provider is not registered: ${providerId}`);
    return descriptor;
  }

  list(): ProviderDescriptor[] {
    return [...this.descriptors.values()];
  }

  requireOnly(): ProviderDescriptor {
    const providers = this.list();
    if (providers.length !== 1) {
      throw new Error(providers.length === 0
        ? "没有可用的 Agent provider。请先在设置中完成安装与认证。"
        : "当前存在多个 Agent provider，请先为本次对话或项目选择 provider。");
    }
    return providers[0]!;
  }

  findActiveTurn(runtimeScopeId: string): ActiveProviderTurn | null {
    for (const descriptor of this.descriptors.values()) {
      const active = descriptor.conversation.getActiveTurn(runtimeScopeId);
      if (active) return active;
    }
    return null;
  }

  findActiveTurns(runtimeScopeIds: Iterable<string>): ActiveProviderTurn[] {
    const turns = new Map<string, ActiveProviderTurn>();
    for (const runtimeScopeId of runtimeScopeIds) {
      for (const descriptor of this.descriptors.values()) {
        const turn = descriptor.conversation.getActiveTurn(runtimeScopeId);
        if (turn) turns.set(`${turn.providerId}:${turn.attemptId}`, turn);
      }
    }
    return [...turns.values()];
  }

  listActiveTurns(): ActiveProviderTurn[] {
    const turns = new Map<string, ActiveProviderTurn>();
    for (const descriptor of this.descriptors.values()) {
      for (const turn of descriptor.conversation.listActiveTurns()) {
        turns.set(`${turn.providerId}:${turn.attemptId}`, turn);
      }
    }
    return [...turns.values()];
  }

  async shutdownAll(reason?: string): Promise<void> {
    const results = await Promise.allSettled(
      [...this.descriptors.values()].map((descriptor) => Promise.resolve(descriptor.runtime.shutdown(reason))),
    );
    const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (failures.length > 0) throw new AggregateError(failures, "One or more Provider runtimes failed to shut down.");
  }

  async shutdownProject(projectId: string, projectPath: string, reason?: string): Promise<void> {
    const results = await Promise.allSettled(
      [...this.descriptors.values()].map((descriptor) => Promise.resolve(
        descriptor.runtime.shutdownProject({ projectId, projectPath }, reason),
      )),
    );
    const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (failures.length > 0) {
      throw new AggregateError(failures, `One or more Provider runtimes failed to stop project ${projectId}.`);
    }
  }

  async require(providerId: ProviderId, profile: ProviderOperationProfile, project: import("../types/index.js").ManagedProject | null, projectPath?: string): Promise<ProviderDescriptor> {
    return (await this.requireProfiles(providerId, [profile], project, projectPath)).descriptor;
  }

  async requireProfiles(
    providerId: ProviderId,
    profiles: readonly ProviderOperationProfile[],
    project: import("../types/index.js").ManagedProject | null,
    projectPath?: string,
  ): Promise<{ descriptor: ProviderDescriptor; snapshot: ProviderCapabilitySnapshot }> {
    const descriptor = this.get(providerId);
    const snapshot = await descriptor.capabilitySnapshot(project, projectPath);
    for (const profile of [...new Set(profiles)]) {
      const missing = missingProviderCapabilities(snapshot, profile);
      if (!snapshot.runnable || missing.length > 0) {
        throw new Error(`Provider ${providerId} cannot run ${profile}; missing ready capabilities: ${missing.join(", ") || "runtime"}`);
      }
    }
    return { descriptor, snapshot };
  }
}
