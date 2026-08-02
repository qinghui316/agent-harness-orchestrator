import { AmbientScheduler, type AmbientSelection, type AmbientSelectionToken, type OfficeClock, type RandomSource } from "./ambientScheduler.js";
import { OfficeAmbientPolicy } from "./officeAmbientPolicy.js";
import { ChoreographyEngine } from "./choreographyEngine.js";
import { OfficeActivityCompiler } from "./officeActivityCompiler.js";
import { OfficeBehaviorPolicy, participantBehaviorActor, residentBehaviorActor } from "./officeBehaviorPolicy.js";
import { OfficeCalibrationResolver } from "./officeCalibrationResolver.js";
import type { OfficeExperienceSnapshot, OfficeParticipant, OfficeResident, OfficeSemanticEvent, OfficeStation } from "./officeExperience.js";

export class OfficeDirector {
  private snapshot: OfficeExperienceSnapshot | null = null;
  private reducedMotion = false;
  private pageHidden = false;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private dispatchingChildId: string | null = null;
  private dispatchGeneration = 0;
  private readonly ambient: AmbientScheduler;
  private readonly activeAmbient = new Map<string, { token: AmbientSelectionToken; completion: Promise<void> }>();
  private readonly dispatchReservations = new Set<string>();

  constructor(
    private readonly engine: ChoreographyEngine,
    resolver: OfficeCalibrationResolver,
    private readonly behavior = new OfficeBehaviorPolicy(),
    private readonly compiler = new OfficeActivityCompiler(resolver),
    clock?: OfficeClock,
    random?: RandomSource,
    private readonly ambientPolicy = new OfficeAmbientPolicy(),
  ) {
    this.ambient = new AmbientScheduler((selection) => this.runAmbient(selection), clock, random, undefined, this.ambientPolicy);
  }

  sync(snapshot: OfficeExperienceSnapshot, events: readonly OfficeSemanticEvent[], reducedMotion: boolean): void {
    const previousSnapshot = this.snapshot;
    const priorContext = this.snapshot?.contextId;
    const reducedMotionChanged = this.reducedMotion !== reducedMotion;
    this.snapshot = snapshot;
    this.reducedMotion = reducedMotion;
    const contextChanged = priorContext != null && priorContext !== snapshot.contextId;
    if (contextChanged) {
      this.resetChoreography(previousSnapshot);
      this.restoreScopeOccupancy(previousSnapshot, snapshot);
    }
    if (reducedMotionChanged) {
      if (reducedMotion) this.resetChoreography(previousSnapshot);
      this.restoreSnapshotOccupants(snapshot);
    }
    if (reducedMotion) this.ambient.sync(snapshot, false);
    const movedParticipants = new Set(events.filter((event) => event.kind === "station-changed").map((event) => event.participantId));

    for (const event of events) {
      if (event.kind === "scope-reset") {
        if (!contextChanged) {
          this.resetChoreography(previousSnapshot);
          this.restoreScopeOccupancy(previousSnapshot, snapshot);
        }
        continue;
      }
      if (event.kind === "scope-terminal") {
        this.resetChoreography(previousSnapshot);
        this.restoreSnapshotOccupants(snapshot);
        continue;
      }
      if (event.kind === "resident-removed") {
        this.engine.cancelActor(event.residentId);
        const removed = previousSnapshot?.residents.find((candidate) => candidate.residentId === event.residentId);
        void this.engine.run(
          event.residentId,
          this.compiler.actorExit(event.residentId, removed?.stationId ?? null, Boolean(removed && !this.isStationOccupied(removed.stationId))),
          "semantic",
        );
        continue;
      }
      if (event.kind === "resident-added" || event.kind === "resident-station-changed") {
        const resident = snapshot.residents.find((candidate) => candidate.residentId === event.residentId);
        if (!resident) continue;
        this.engine.cancelActor(resident.residentId);
        void this.restoreResident(resident, event.kind === "resident-station-changed" ? event.fromStationId : undefined);
        continue;
      }
      if (event.kind === "participant-removed") {
        if (event.participantId === this.dispatchingChildId) {
          const main = snapshot.participants.find((candidate) => candidate.kind === "main");
          if (main) this.engine.cancelActor(main.participantId);
        }
        this.engine.cancelActor(event.participantId);
        const removed = previousSnapshot?.participants.find((candidate) => candidate.participantId === event.participantId);
        void this.engine.run(
          event.participantId,
          this.compiler.actorExit(event.participantId, removed?.stationId ?? null, Boolean(removed && !this.isStationOccupied(removed.stationId))),
          "semantic",
        );
        continue;
      }
      const participant = snapshot.participants.find((candidate) => candidate.participantId === event.participantId);
      if (!participant) continue;
      if (snapshot.lifecycle === "terminal") {
        this.activeAmbient.delete(participant.participantId);
        this.engine.cancelActor(participant.participantId);
        this.hideTerminalParticipant(participant, snapshot);
        continue;
      }
      if (event.kind === "station-changed") {
        if (event.participantId === this.dispatchingChildId) {
          const main = snapshot.participants.find((candidate) => candidate.kind === "main");
          if (main) this.engine.cancelActor(main.participantId);
        }
        this.engine.cancelActor(participant.participantId);
        void this.restoreAndApplySemantic(participant, false, event.fromStationId);
        continue;
      }
      if (event.kind === "state-changed" && movedParticipants.has(participant.participantId)) continue;
      if (event.kind === "state-changed" && this.activeAmbient.has(participant.participantId)) {
        this.engine.cancelAmbient(participant.participantId);
        this.activeAmbient.delete(participant.participantId);
        void this.restoreAndApplySemantic(participant, event.to === "completed");
        continue;
      }
      if (event.kind === "state-changed" && participant.participantId === this.dispatchingChildId) {
        if (participant.state === "attention" || participant.state === "blocked" || participant.state === "failed" || participant.state === "interrupted") {
          const main = snapshot.participants.find((candidate) => candidate.kind === "main");
          if (main) this.engine.cancelActor(main.participantId);
        }
        continue;
      }
      if (event.kind === "participant-added" && participant.kind === "child" && this.isMainParent(event.parentParticipantId)) {
        const contextId = snapshot.contextId;
        const generation = this.dispatchGeneration;
        void this.restoreAndApplySemantic(participant);
        this.dispatchQueue = this.dispatchQueue
          .catch(() => undefined)
          .then(() => this.runDispatch(participant.participantId, contextId, generation))
          .catch(() => undefined);
      } else {
        void this.restoreAndApplySemantic(participant, event.kind === "state-changed" && event.to === "completed");
      }
    }
    this.ambient.sync(snapshot, !reducedMotion && !this.pageHidden);
  }

  hydrate(snapshot: OfficeExperienceSnapshot, reducedMotion: boolean): void {
    this.snapshot = snapshot;
    this.reducedMotion = reducedMotion;
    this.restoreSnapshotOccupants(snapshot, true);
    this.ambient.sync(snapshot, !reducedMotion && !this.pageHidden);
  }

  visibilityChanged(hidden: boolean): void {
    this.pageHidden = hidden;
    if (!this.snapshot) return;
    if (hidden) {
      this.ambient.sync(this.snapshot, false);
      this.resetChoreography(this.snapshot);
    } else {
      if (this.snapshot.lifecycle === "active") {
        for (const participant of this.snapshot.participants) void this.restoreAndApplySemantic(participant);
      }
      for (const resident of this.snapshot.residents) void this.restoreResident(resident);
      this.ambient.sync(this.snapshot, !this.reducedMotion);
    }
  }

  dispose(): void {
    this.dispatchGeneration += 1;
    this.ambient.dispose();
    this.engine.dispose();
  }

  private async applySemantic(participant: OfficeParticipant, celebrateCompleted = false): Promise<void> {
    const actor = participantBehaviorActor(participant);
    await this.engine.run(actor.actorId, this.compiler.behavior(actor, this.behavior.resolve(actor, celebrateCompleted)), "semantic");
  }

  private async applyResident(resident: OfficeResident): Promise<void> {
    const actor = residentBehaviorActor(resident);
    await this.engine.run(actor.actorId, this.compiler.behavior(actor, this.behavior.resolve(actor)), "semantic");
  }

  private async restoreAndApplySemantic(participant: OfficeParticipant, celebrateCompleted = false, previousStationId?: string): Promise<void> {
    const station = this.currentStation(participant.stationId);
    const actor = participantBehaviorActor(participant);
    const vacatedStationId = previousStationId && !this.isStationOccupied(previousStationId) ? previousStationId : undefined;
    await this.engine.run(
      participant.participantId,
      this.compiler.behaviorAtStation(actor, this.behavior.resolve(actor, celebrateCompleted), station, vacatedStationId),
      "semantic",
    );
  }

  private async restoreResident(resident: OfficeResident, previousStationId?: string): Promise<void> {
    const station = this.currentStation(resident.stationId);
    const actor = residentBehaviorActor(resident);
    const vacatedStationId = previousStationId && !this.isStationOccupied(previousStationId) ? previousStationId : undefined;
    await this.engine.run(
      resident.residentId,
      this.compiler.behaviorAtStation(actor, this.behavior.resolve(actor), station, vacatedStationId),
      "semantic",
    );
  }

  private async runDispatch(childId: string, contextId: string, generation: number): Promise<void> {
    let snapshot = this.snapshot;
    if (!snapshot || snapshot.contextId !== contextId || generation !== this.dispatchGeneration || snapshot.lifecycle !== "active" || this.reducedMotion || this.pageHidden) return;
    let main = snapshot.participants.find((participant) => participant.kind === "main");
    let child = snapshot.participants.find((participant) => participant.participantId === childId);
    if (!main || !child || !this.isMainParent(child.parentParticipantId)) return;
    const reservedMainId = main.participantId;
    const reservedChildId = child.participantId;
    this.dispatchReservations.add(reservedMainId);
    this.dispatchReservations.add(reservedChildId);
    try {
      await Promise.all([this.activeAmbient.get(reservedMainId)?.completion, this.activeAmbient.get(reservedChildId)?.completion].filter((value): value is Promise<void> => Boolean(value)));
      snapshot = this.snapshot;
      main = snapshot?.participants.find((participant) => participant.kind === "main");
      child = snapshot?.participants.find((participant) => participant.participantId === childId);
      if (!snapshot || snapshot.contextId !== contextId || generation !== this.dispatchGeneration || snapshot.lifecycle !== "active" || this.reducedMotion || this.pageHidden || !main || !child || !this.isMainParent(child.parentParticipantId) || isDispatchBlocked(main) || isDispatchBlocked(child)) {
        if (child) await this.restoreAndApplySemantic(child);
        return;
      }
      const dispatchMain = main;
      const dispatchChild = child;
      const route = this.currentStation(dispatchMain.stationId).handoffRoutes[dispatchChild.stationId];
      if (!route) throw new Error(`Office station ${dispatchMain.stationId} has no handoff route to ${dispatchChild.stationId}.`);
      this.dispatchingChildId = dispatchChild.participantId;
      try {
        await this.engine.run(
          dispatchMain.participantId,
          this.compiler.dispatch(dispatchMain.participantId, dispatchChild.participantId, dispatchMain.stationId, route),
          "semantic",
        );
      } finally {
        if (this.dispatchingChildId === dispatchChild.participantId) this.dispatchingChildId = null;
        if (generation === this.dispatchGeneration && this.snapshot?.contextId === contextId) {
          const latestMain = this.snapshot.participants.find((participant) => participant.participantId === dispatchMain.participantId);
          const latestChild = this.snapshot.participants.find((participant) => participant.participantId === dispatchChild.participantId);
          if (latestMain) await this.restoreAndApplySemantic(latestMain);
          if (latestChild) await this.restoreAndApplySemantic(latestChild);
        }
      }
    } finally {
      this.dispatchReservations.delete(reservedMainId);
      this.dispatchReservations.delete(reservedChildId);
      if (this.dispatchingChildId === reservedChildId) this.dispatchingChildId = null;
    }
  }

  private async runAmbient(selection: AmbientSelection): Promise<boolean> {
    const { actorId, actorKind, actorIdentityKey, intent, token } = selection;
    const eligibleActor = this.ambientPolicy.actor(this.snapshot, actorId);
    const participant = actorKind === "participant" ? this.snapshot?.participants.find((candidate) => candidate.participantId === actorId) : undefined;
    const resident = actorKind === "resident" ? this.snapshot?.residents.find((candidate) => candidate.residentId === actorId) : undefined;
    if (!eligibleActor || eligibleActor.identityKey !== actorIdentityKey
      || (!participant && !resident)
      || (participant && (this.snapshot?.lifecycle !== "active" || this.dispatchReservations.has(participant.participantId) || participant.participantId === this.dispatchingChildId || (participant.state !== "idle" && participant.state !== "completed")))
      || this.reducedMotion || this.pageHidden) return false;
    const latestId = participant?.participantId ?? resident!.residentId;
    const stationId = participant?.stationId ?? resident!.stationId;
    let finishAmbient!: () => void;
    const completion = new Promise<void>((resolve) => { finishAmbient = resolve; });
    this.activeAmbient.set(latestId, { token, completion });
    const command = this.compiler.ambient(latestId, this.currentStation(stationId), intent);
    let executed = false;
    let restoreAfterAmbient = true;
    try {
      executed = await this.engine.run(latestId, command, "ambient");
      restoreAfterAmbient = executed;
    } finally {
      try {
        if (this.activeAmbient.get(latestId)?.token === token) {
          this.activeAmbient.delete(latestId);
          if (restoreAfterAmbient) {
            const currentActor = this.ambientPolicy.actor(this.snapshot, latestId);
            const currentParticipant = currentActor?.identityKey === actorIdentityKey
              ? this.snapshot?.participants.find((candidate) => candidate.participantId === latestId)
              : undefined;
            const currentResident = currentActor?.identityKey === actorIdentityKey
              ? this.snapshot?.residents.find((candidate) => candidate.residentId === latestId)
              : undefined;
            if (currentParticipant && this.snapshot?.lifecycle === "active") await this.restoreAndApplySemantic(currentParticipant);
            else if (currentResident) await this.restoreResident(currentResident);
          }
        }
      } finally {
        finishAmbient();
      }
    }
    return executed;
  }

  private isMainParent(parentId: string | null): boolean {
    const main = this.snapshot?.participants.find((participant) => participant.kind === "main");
    return parentId != null && parentId === main?.participantId;
  }

  private currentStation(stationId: string): OfficeStation {
    const station = this.snapshot?.stations.find((candidate) => candidate.stationId === stationId);
    if (!station) throw new Error(`Office station ${stationId} is not present in the current snapshot.`);
    return station;
  }

  private isStationOccupied(stationId: string): boolean {
    return Boolean(
      (this.snapshot?.lifecycle === "active" && this.snapshot.participants.some((participant) => participant.stationId === stationId))
      || this.snapshot?.residents.some((resident) => resident.stationId === stationId),
    );
  }

  private restoreScopeOccupancy(previousSnapshot: OfficeExperienceSnapshot | null, snapshot: OfficeExperienceSnapshot): void {
    const currentStations = new Set([
      ...(snapshot.lifecycle === "active" ? snapshot.participants.map((participant) => participant.stationId) : []),
      ...snapshot.residents.map((resident) => resident.stationId),
    ]);
    const previousStations = new Set([
      ...(previousSnapshot?.participants.map((participant) => participant.stationId) ?? []),
      ...(previousSnapshot?.residents.map((resident) => resident.stationId) ?? []),
    ]);
    for (const stationId of previousStations) {
      if (currentStations.has(stationId)) continue;
      void this.engine.run(`station:${stationId}`, this.compiler.vacateStation(stationId), "semantic");
    }
    this.restoreSnapshotOccupants(snapshot);
  }

  private restoreSnapshotOccupants(snapshot: OfficeExperienceSnapshot, initial = false): void {
    if (snapshot.lifecycle === "active") {
      for (const participant of snapshot.participants) {
        if (initial) void this.applySemantic(participant);
        else void this.restoreAndApplySemantic(participant);
      }
    } else {
      for (const participant of snapshot.participants) this.hideTerminalParticipant(participant, snapshot);
    }
    for (const resident of snapshot.residents) {
      if (initial) void this.applyResident(resident);
      else void this.restoreResident(resident);
    }
  }

  private hideTerminalParticipant(participant: OfficeParticipant, snapshot: OfficeExperienceSnapshot): void {
    const residentOccupiesStation = snapshot.residents.some((resident) => resident.stationId === participant.stationId);
    void this.engine.run(
      participant.participantId,
      this.compiler.actorExit(participant.participantId, participant.stationId, !residentOccupiesStation),
      "semantic",
    );
  }

  private resetChoreography(previousSnapshot: OfficeExperienceSnapshot | null): void {
    this.dispatchGeneration += 1;
    this.dispatchingChildId = null;
    this.dispatchReservations.clear();
    this.activeAmbient.clear();
    this.engine.resetScope();
    for (const participant of previousSnapshot?.participants ?? []) {
      void this.engine.run(participant.participantId, this.compiler.clearEffect(participant.participantId), "semantic");
    }
    for (const resident of previousSnapshot?.residents ?? []) {
      void this.engine.run(resident.residentId, this.compiler.clearEffect(resident.residentId), "semantic");
    }
  }
}

function isDispatchBlocked(participant: OfficeParticipant): boolean {
  return participant.state === "attention" || participant.state === "blocked" || participant.state === "failed" || participant.state === "interrupted";
}
