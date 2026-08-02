import { OfficeAmbientPolicy, type OfficeAmbientActor } from "./officeAmbientPolicy.js";
import type { OfficeAmbientIntent, OfficeExperienceSnapshot, OfficeFacilityId } from "./officeExperience.js";

export interface OfficeClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface RandomSource {
  next(): number;
}

export type OfficeAmbientTimingPolicy = {
  ordinaryDelayMs: { min: number; max: number };
  mobilityDelayMs: { min: number; max: number };
  lookAroundDelayMs: { min: number; max: number };
  lookAroundActorCooldownMs: number;
};

export const DEFAULT_OFFICE_AMBIENT_TIMING: OfficeAmbientTimingPolicy = {
  ordinaryDelayMs: { min: 8_000, max: 18_000 },
  mobilityDelayMs: { min: 25_000, max: 60_000 },
  lookAroundDelayMs: { min: 90_000, max: 180_000 },
  lookAroundActorCooldownMs: 180_000,
};

export type AmbientSelectionToken = {
  id: number;
  generation: number;
};

export type AmbientSelection = {
  actorId: string;
  actorKind: "participant" | "resident";
  actorIdentityKey: string;
  intent: OfficeAmbientIntent;
  token: AmbientSelectionToken;
};

type MobilityDeadline = {
  actorIdentityKey: string;
  dueAt: number | null;
  remainingMs: number | null;
};

type ActiveReservation = {
  token: AmbientSelectionToken;
  intent: OfficeAmbientIntent;
};

const FACILITIES: readonly OfficeFacilityId[] = ["coffee", "treadmill", "toilet"];
const MAX_ACTIVE_AMBIENT = 2;

export class AmbientScheduler {
  private timer: unknown = null;
  private timerGeneration = 0;
  private drainScheduled = false;
  private enabled = false;
  private snapshot: OfficeExperienceSnapshot | null = null;
  private contextId: string | null = null;
  private contextGeneration = 0;
  private nextTokenId = 0;
  private ordinaryDueAt: number | null = null;
  private ordinaryRemainingMs: number | null = null;
  private pausedAt: number | null = null;
  private lookAroundDueAt: number | null = null;
  private lookAroundRemainingMs: number | null = null;
  private readonly mobilityDeadlines = new Map<string, MobilityDeadline>();
  private readonly activeActors = new Map<string, ActiveReservation>();
  private readonly activeFacilities = new Map<OfficeFacilityId, AmbientSelectionToken>();
  private readonly lastLookAroundAtByActor = new Map<string, number>();

  constructor(
    private readonly run: (selection: AmbientSelection) => Promise<boolean | void>,
    private readonly clock: OfficeClock = browserClock,
    private readonly random: RandomSource = browserRandom,
    private readonly timing: OfficeAmbientTimingPolicy = DEFAULT_OFFICE_AMBIENT_TIMING,
    private readonly policy = new OfficeAmbientPolicy(),
  ) {}

  sync(snapshot: OfficeExperienceSnapshot, enabled: boolean): void {
    const contextChanged = this.contextId !== snapshot.contextId;
    if (contextChanged) this.resetContext(snapshot.contextId);
    this.snapshot = snapshot;
    this.reconcileEligibility();

    if (!enabled) {
      if (this.enabled) this.pauseDeadlines();
      this.enabled = false;
      this.cancelTimer();
      return;
    }

    if (!this.enabled) {
      this.enabled = true;
      this.resumeDeadlines();
    }
    this.scheduleNext();
  }

  dispose(): void {
    if (this.enabled) this.pauseDeadlines();
    this.enabled = false;
    this.contextGeneration += 1;
    this.cancelTimer();
    this.snapshot = null;
    this.activeActors.clear();
    this.activeFacilities.clear();
  }

  private reconcileEligibility(): void {
    const actors = this.policy.eligibleActors(this.snapshot);
    const current = new Map(actors.map((actor) => [actor.actorId, actor] as const));
    for (const [actorId, deadline] of this.mobilityDeadlines) {
      const actor = current.get(actorId);
      if (actor?.identityKey === deadline.actorIdentityKey) continue;
      this.mobilityDeadlines.delete(actorId);
      this.releaseActorReservation(actorId);
      this.lastLookAroundAtByActor.delete(actorId);
    }
    for (const actor of actors) {
      if (this.mobilityDeadlines.has(actor.actorId)) continue;
      this.mobilityDeadlines.set(actor.actorId, this.newDeadline(actor));
    }
  }

  private newDeadline(actor: OfficeAmbientActor): MobilityDeadline {
    const delay = randomBetween(this.random, this.timing.mobilityDelayMs);
    return this.enabled
      ? { actorIdentityKey: actor.identityKey, dueAt: this.clock.now() + delay, remainingMs: null }
      : { actorIdentityKey: actor.identityKey, dueAt: null, remainingMs: delay };
  }

  private scheduleNext(): void {
    if (!this.enabled || this.timer != null) return;
    if (this.activeActors.size >= MAX_ACTIVE_AMBIENT) return;
    const now = this.clock.now();
    if (this.ordinaryDueAt == null) this.ordinaryDueAt = now + randomBetween(this.random, this.timing.ordinaryDelayMs);
    if (this.lookAroundDueAt == null) this.lookAroundDueAt = now + randomBetween(this.random, this.timing.lookAroundDelayMs);
    const candidates = [this.ordinaryDueAt, this.lookAroundDueAt];
    if (this.activeActors.size < MAX_ACTIVE_AMBIENT) {
      const availableFacilities = this.availableFacilities();
      for (const [actorId, deadline] of this.mobilityDeadlines) {
        const actor = this.policy.actor(this.snapshot, actorId);
        if (!this.activeActors.has(actorId) && deadline.dueAt != null && actor && this.canUseFacility(actor, availableFacilities)) {
          candidates.push(deadline.dueAt);
        }
      }
    }
    const dueAt = Math.min(...candidates.filter((value): value is number => value != null));
    const generation = this.contextGeneration;
    const timerGeneration = ++this.timerGeneration;
    this.timer = this.clock.setTimeout(() => {
      if (timerGeneration !== this.timerGeneration) return;
      this.timer = null;
      this.drainScheduled = false;
      this.tick(generation);
    }, Math.max(0, dueAt - now));
  }

  private tick(generation: number): void {
    if (!this.enabled || generation !== this.contextGeneration) return;
    const now = this.clock.now();
    const ordinaryDue = this.ordinaryDueAt != null && now >= this.ordinaryDueAt;
    if (ordinaryDue) this.ordinaryDueAt = now + randomBetween(this.random, this.timing.ordinaryDelayMs);

    const overdueActorIds = new Set(this.overdueActors(now).map((actor) => actor.actorId));
    const overdue = this.executableOverdueActors(now);
    let startedMobility = false;
    for (const actor of overdue) {
      if (this.activeActors.size >= MAX_ACTIVE_AMBIENT) break;
      const facilityId = this.policy.chooseFacility(actor, this.availableFacilities(), this.random.next());
      if (!facilityId) continue;
      this.start(actor, { kind: "facility", facilityId });
      startedMobility = true;
    }

    const overdueRemains = this.executableOverdueActors(now).length > 0;
    if (!startedMobility && !overdueRemains && this.activeActors.size < MAX_ACTIVE_AMBIENT) {
      if (this.lookAroundDueAt != null && now >= this.lookAroundDueAt) {
        const actor = this.takeLookAround(now, overdueActorIds);
        if (actor) this.start(actor, { kind: "look-around" });
        else this.lookAroundDueAt = now + randomBetween(this.random, this.timing.ordinaryDelayMs);
      } else if (ordinaryDue) {
        const unavailableActorIds = new Set([...this.activeActors.keys(), ...overdueActorIds]);
        const desk = this.policy.chooseDesk(this.policy.eligibleActors(this.snapshot), unavailableActorIds, this.random.next());
        if (desk) this.start(desk.actor, desk.intent);
      }
    }
    this.scheduleNext();
  }

  private overdueActors(now: number): OfficeAmbientActor[] {
    return this.policy.eligibleActors(this.snapshot)
      .filter((actor) => {
        const deadline = this.mobilityDeadlines.get(actor.actorId);
        return !this.activeActors.has(actor.actorId)
          && deadline?.actorIdentityKey === actor.identityKey
          && deadline.dueAt != null
          && deadline.dueAt <= now;
      })
      .sort((left, right) => {
        const leftDue = this.mobilityDeadlines.get(left.actorId)!.dueAt!;
        const rightDue = this.mobilityDeadlines.get(right.actorId)!.dueAt!;
        return leftDue - rightDue || left.actorId.localeCompare(right.actorId);
      });
  }

  private availableFacilities(): Set<OfficeFacilityId> {
    return new Set(FACILITIES.filter((facilityId) => !this.activeFacilities.has(facilityId)));
  }

  private executableOverdueActors(now: number): OfficeAmbientActor[] {
    const available = this.availableFacilities();
    return this.overdueActors(now).filter((actor) => this.canUseFacility(actor, available));
  }

  private canUseFacility(actor: OfficeAmbientActor, available: ReadonlySet<OfficeFacilityId>): boolean {
    return actor.preferences.facilities.some((preference) => preference.weight > 0 && available.has(preference.id));
  }

  private takeLookAround(now: number, overdueActorIds: ReadonlySet<string>): OfficeAmbientActor | null {
    if ([...this.activeActors.values()].some((reservation) => reservation.intent.kind === "look-around")) return null;
    const unavailable = new Set([...this.activeActors.keys(), ...overdueActorIds]);
    const candidates = this.policy.eligibleActors(this.snapshot).filter((actor) => (
      now - (this.lastLookAroundAtByActor.get(actor.actorId) ?? Number.NEGATIVE_INFINITY) >= this.timing.lookAroundActorCooldownMs
    ));
    return this.policy.chooseLookAround(candidates, unavailable, this.random.next());
  }

  private start(actor: OfficeAmbientActor, intent: OfficeAmbientIntent): void {
    const token = { id: ++this.nextTokenId, generation: this.contextGeneration };
    const selection: AmbientSelection = {
      actorId: actor.actorId,
      actorKind: actor.actorKind,
      actorIdentityKey: actor.identityKey,
      intent,
      token,
    };
    this.activeActors.set(actor.actorId, { token, intent });
    if (intent.kind === "facility") {
      this.activeFacilities.set(intent.facilityId, token);
      this.setNextMobilityDeadline(actor, this.timing.mobilityDelayMs);
    }
    void this.run(selection)
      .then((result) => this.finishSelection(selection, result !== false))
      .catch(() => this.finishSelection(selection, false))
      .finally(() => this.releaseSelection(selection));
  }

  private finishSelection(selection: AmbientSelection, executed: boolean): void {
    if (!this.isCurrent(selection)) return;
    const now = this.clock.now();
    if (!executed) {
      if (selection.intent.kind === "facility") {
        const actor = this.policy.actor(this.snapshot, selection.actorId);
        if (actor?.identityKey === selection.actorIdentityKey) this.setNextMobilityDeadline(actor, this.timing.ordinaryDelayMs);
      } else if (selection.intent.kind === "look-around") {
        this.setNextLookAroundDeadline(this.timing.ordinaryDelayMs);
      }
      return;
    }
    if (selection.intent.kind === "look-around") {
      this.lastLookAroundAtByActor.set(selection.actorId, this.enabled ? now : (this.pausedAt ?? now));
      this.setNextLookAroundDeadline(this.timing.lookAroundDelayMs);
    }
  }

  private releaseSelection(selection: AmbientSelection): void {
    if (!this.isCurrent(selection)) return;
    this.activeActors.delete(selection.actorId);
    if (selection.intent.kind === "facility" && this.activeFacilities.get(selection.intent.facilityId) === selection.token) {
      this.activeFacilities.delete(selection.intent.facilityId);
    }
    this.requestImmediateDrain();
  }

  private isCurrent(selection: AmbientSelection): boolean {
    return selection.token.generation === this.contextGeneration
      && this.activeActors.get(selection.actorId)?.token === selection.token;
  }

  private releaseActorReservation(actorId: string): void {
    const reservation = this.activeActors.get(actorId);
    if (!reservation) return;
    this.activeActors.delete(actorId);
    if (reservation.intent.kind === "facility" && this.activeFacilities.get(reservation.intent.facilityId) === reservation.token) {
      this.activeFacilities.delete(reservation.intent.facilityId);
    }
  }

  private setNextMobilityDeadline(actor: OfficeAmbientActor, range: { min: number; max: number }): void {
    const delay = randomBetween(this.random, range);
    this.mobilityDeadlines.set(actor.actorId, this.enabled
      ? { actorIdentityKey: actor.identityKey, dueAt: this.clock.now() + delay, remainingMs: null }
      : { actorIdentityKey: actor.identityKey, dueAt: null, remainingMs: delay });
  }

  private setNextLookAroundDeadline(range: { min: number; max: number }): void {
    const delay = randomBetween(this.random, range);
    if (this.enabled) {
      this.lookAroundDueAt = this.clock.now() + delay;
      this.lookAroundRemainingMs = null;
    } else {
      this.lookAroundDueAt = null;
      this.lookAroundRemainingMs = delay;
    }
  }

  private requestImmediateDrain(): void {
    const now = this.clock.now();
    const dueLookAround = this.lookAroundDueAt != null
      && this.lookAroundDueAt <= now
      && this.policy.eligibleActors(this.snapshot).some((actor) => (
        !this.activeActors.has(actor.actorId)
        && now - (this.lastLookAroundAtByActor.get(actor.actorId) ?? Number.NEGATIVE_INFINITY) >= this.timing.lookAroundActorCooldownMs
      ));
    if (!this.enabled || this.drainScheduled || (this.executableOverdueActors(now).length === 0 && !dueLookAround)) {
      this.scheduleNext();
      return;
    }
    if (this.timer != null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.drainScheduled = true;
    const generation = this.contextGeneration;
    const timerGeneration = ++this.timerGeneration;
    this.timer = this.clock.setTimeout(() => {
      if (timerGeneration !== this.timerGeneration) return;
      this.timer = null;
      this.drainScheduled = false;
      this.tick(generation);
    }, 0);
  }

  private resetContext(contextId: string): void {
    this.contextId = contextId;
    this.contextGeneration += 1;
    this.cancelTimer();
    this.activeActors.clear();
    this.activeFacilities.clear();
    this.mobilityDeadlines.clear();
    this.lastLookAroundAtByActor.clear();
    this.ordinaryDueAt = null;
    this.ordinaryRemainingMs = null;
    this.pausedAt = null;
    this.lookAroundDueAt = null;
    this.lookAroundRemainingMs = null;
  }

  private pauseDeadlines(): void {
    const now = this.clock.now();
    this.pausedAt = now;
    for (const deadline of this.mobilityDeadlines.values()) {
      if (deadline.dueAt != null) deadline.remainingMs = Math.max(0, deadline.dueAt - now);
      deadline.dueAt = null;
    }
    if (this.ordinaryDueAt != null) this.ordinaryRemainingMs = Math.max(0, this.ordinaryDueAt - now);
    if (this.lookAroundDueAt != null) this.lookAroundRemainingMs = Math.max(0, this.lookAroundDueAt - now);
    this.ordinaryDueAt = null;
    this.lookAroundDueAt = null;
  }

  private resumeDeadlines(): void {
    const now = this.clock.now();
    if (this.pausedAt != null) {
      const pausedDuration = Math.max(0, now - this.pausedAt);
      for (const [actorId, lastAt] of this.lastLookAroundAtByActor) {
        this.lastLookAroundAtByActor.set(actorId, lastAt + pausedDuration);
      }
    }
    this.pausedAt = null;
    for (const deadline of this.mobilityDeadlines.values()) {
      deadline.dueAt = now + (deadline.remainingMs ?? randomBetween(this.random, this.timing.mobilityDelayMs));
      deadline.remainingMs = null;
    }
    this.ordinaryDueAt = now + (this.ordinaryRemainingMs ?? randomBetween(this.random, this.timing.ordinaryDelayMs));
    this.lookAroundDueAt = now + (this.lookAroundRemainingMs ?? randomBetween(this.random, this.timing.lookAroundDelayMs));
    this.ordinaryRemainingMs = null;
    this.lookAroundRemainingMs = null;
  }

  private cancelTimer(): void {
    this.timerGeneration += 1;
    if (this.timer != null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.drainScheduled = false;
  }
}

function randomBetween(random: RandomSource, range: { min: number; max: number }): number {
  return range.min + Math.floor(random.next() * (range.max - range.min + 1));
}

const browserClock: OfficeClock = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const browserRandom: RandomSource = { next: () => Math.random() };
