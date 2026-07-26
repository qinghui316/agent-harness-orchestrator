import type { OfficeRuntimeVisualCommand } from "./officeRuntimeCalibration.js";

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

  async run(participantId: string, command: OfficeRuntimeVisualCommand, channel: OfficeCommandChannel): Promise<void> {
    const participantChannels = this.channels.get(participantId) ?? new Map();
    if (channel === "ambient") {
      if (participantChannels.has("semantic")) return;
    } else if (channel === "semantic") {
      participantChannels.get("ambient")?.abort();
    }
    participantChannels.get(channel)?.abort();
    const controller = new AbortController();
    this.scope.signal.addEventListener("abort", () => controller.abort(), { once: true });
    participantChannels.set(channel, controller);
    this.channels.set(participantId, participantChannels);
    await this.execute(command, controller.signal);
    if (participantChannels.get(channel) === controller) participantChannels.delete(channel);
  }

  cancelParticipant(participantId: string): void {
    for (const controller of this.channels.get(participantId)?.values() ?? []) controller.abort();
    this.channels.delete(participantId);
  }

  cancelAmbient(participantId: string): void {
    this.channels.get(participantId)?.get("ambient")?.abort();
    this.channels.get(participantId)?.delete("ambient");
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
    const durationMs = command.kind === "followRoute" ? undefined : "durationMs" in command ? command.durationMs : undefined;
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
