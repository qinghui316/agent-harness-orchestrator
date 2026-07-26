import type { OfficeAmbientAction, OfficeExperienceSnapshot, OfficeParticipant } from "./officeExperience.js";

export interface OfficeClock {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RandomSource {
  next(): number;
}

export type AmbientSelection = { participant: OfficeParticipant; action: OfficeAmbientAction };

export class AmbientScheduler {
  private timer: unknown = null;
  private enabled = false;
  private snapshot: OfficeExperienceSnapshot | null = null;
  private bag: AmbientSelection[] = [];
  private last: { participantId: string; action: OfficeAmbientAction } | null = null;
  private readonly active = new Map<string, OfficeAmbientAction>();

  constructor(
    private readonly run: (selection: AmbientSelection) => Promise<void>,
    private readonly clock: OfficeClock = browserClock,
    private readonly random: RandomSource = browserRandom,
  ) {}

  sync(snapshot: OfficeExperienceSnapshot, enabled: boolean): void {
    this.snapshot = snapshot;
    this.enabled = enabled && snapshot.lifecycle === "active";
    if (!this.enabled) {
      this.cancel();
      return;
    }
    if (this.active.size < 2 && this.timer == null) this.schedule();
  }

  interrupt(participantId?: string): void {
    if (!participantId || this.last?.participantId === participantId) this.cancelTimer();
  }

  dispose(): void {
    this.enabled = false;
    this.cancel();
    this.snapshot = null;
  }

  private schedule(): void {
    const delay = 8_000 + Math.floor(this.random.next() * 10_001);
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
  }

  private tick(): void {
    const selection = this.take();
    if (!selection) {
      if (this.active.size === 0) this.schedule();
      return;
    }
    this.active.set(selection.participant.participantId, selection.action);
    this.last = { participantId: selection.participant.participantId, action: selection.action };
    void this.run(selection)
      .catch(() => undefined)
      .finally(() => {
        this.active.delete(selection.participant.participantId);
        if (this.enabled && this.snapshot?.lifecycle === "active" && this.timer == null) this.schedule();
      });
    if (this.active.size < 2 && this.enabled) this.schedule();
  }

  private take(): AmbientSelection | null {
    const mobilityActive = [...this.active.values()].some(isMobilityAction);
    const activeFacilities = new Set([...this.active.values()].filter(isMobilityAction));
    const eligible = ambientCandidates(this.snapshot).filter((selection) => (
      !this.active.has(selection.participant.participantId)
      && (!isMobilityAction(selection.action) || (!mobilityActive && !activeFacilities.has(selection.action)))
    ));
    if (eligible.length === 0) return null;
    const signature = new Set(eligible.map((item) => `${item.participant.participantId}:${item.action}`));
    this.bag = this.bag.filter((item) => signature.has(`${item.participant.participantId}:${item.action}`));
    if (this.bag.length === 0) this.bag = shuffle(eligible, this.random);
    let index = this.bag.findIndex((item) => item.participant.participantId !== this.last?.participantId && item.action !== this.last?.action);
    if (index < 0) index = 0;
    return this.bag.splice(index, 1)[0] ?? null;
  }

  private cancel(): void {
    this.cancelTimer();
    this.bag = [];
  }

  private cancelTimer(): void {
    if (this.timer != null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}

function ambientCandidates(snapshot: OfficeExperienceSnapshot | null): AmbientSelection[] {
  if (!snapshot) return [];
  const participants = snapshot.participants.filter((participant) => participant.state === "idle" || participant.state === "completed");
  return participants.flatMap((participant) => participant.ambientPreferences.flatMap(({ action, weight }) => (
    Array.from({ length: Math.max(1, Math.floor(weight)) }, () => ({ participant, action }))
  )));
}

export function isMobilityAction(action: OfficeAmbientAction): boolean {
  return action === "coffee" || action === "treadmill" || action === "toilet";
}

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random.next() * (index + 1));
    [result[index], result[swap]] = [result[swap]!, result[index]!];
  }
  return result;
}

const browserClock: OfficeClock = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const browserRandom: RandomSource = { next: () => Math.random() };
