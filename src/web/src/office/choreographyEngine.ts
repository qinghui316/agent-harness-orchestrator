import type { OfficeRuntimeVisualCommand } from "./officeVisualContract.js";

export type OfficeCommandChannel = "ambient" | "semantic" | "status";
export type OfficeCommandListener = (command: Exclude<OfficeRuntimeVisualCommand, { kind: "sequence" | "parallel" }>, signal: AbortSignal) => void | Promise<void>;

export class ChoreographyEngine {
  private readonly listeners = new Set<OfficeCommandListener>();
  private readonly channels = new Map<string, Map<OfficeCommandChannel, AbortController>>();
  private scope = new AbortController();

  subscribe(listener: OfficeCommandListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async run(actorId: string, command: OfficeRuntimeVisualCommand, channel: OfficeCommandChannel): Promise<boolean> {
    const actorChannels = this.channels.get(actorId) ?? new Map();
    if (channel === "ambient") {
      if (actorChannels.has("semantic")) return false;
    } else if (channel === "semantic") {
      actorChannels.get("ambient")?.abort();
    }
    actorChannels.get(channel)?.abort();
    const controller = new AbortController();
    this.scope.signal.addEventListener("abort", () => controller.abort(), { once: true });
    actorChannels.set(channel, controller);
    this.channels.set(actorId, actorChannels);
    await this.execute(command, controller.signal);
    if (actorChannels.get(channel) === controller) actorChannels.delete(channel);
    return true;
  }

  cancelActor(actorId: string): void {
    for (const controller of this.channels.get(actorId)?.values() ?? []) controller.abort();
    this.channels.delete(actorId);
  }

  cancelAmbient(actorId: string): void {
    this.channels.get(actorId)?.get("ambient")?.abort();
    this.channels.get(actorId)?.delete("ambient");
  }

  resetScope(): void {
    this.scope.abort();
    this.scope = new AbortController();
    this.channels.clear();
  }

  dispose(): void {
    this.resetScope();
    this.listeners.clear();
  }

  private async execute(command: OfficeRuntimeVisualCommand, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    if (command.kind === "sequence") {
      for (const child of command.commands) {
        await this.execute(child, signal);
        if (signal.aborted) break;
      }
      return;
    }
    if (command.kind === "parallel") {
      await Promise.all(command.commands.map((child) => this.execute(child, signal)));
      return;
    }
    await Promise.all([...this.listeners].map((listener) => Promise.resolve(listener(command, signal))));
    const durationMs = command.kind === "followRoute" || command.kind === "playRouteStage" ? undefined : "durationMs" in command ? command.durationMs : undefined;
    if (durationMs) await abortableDelay(durationMs, signal);
  }
}

function abortableDelay(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = globalThis.setTimeout(resolve, durationMs);
    signal.addEventListener("abort", () => {
      globalThis.clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
