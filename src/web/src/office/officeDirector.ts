import { AmbientScheduler, type AmbientSelection, type OfficeClock, type RandomSource } from "./ambientScheduler.js";
import { ChoreographyEngine } from "./choreographyEngine.js";
import { OfficeBehaviorPolicy, stablePhase } from "./officeBehaviorPolicy.js";
import { OfficeCalibrationResolver } from "./officeCalibrationResolver.js";
import type { OfficeExperienceSnapshot, OfficeParticipant, OfficeRouteStage, OfficeSemanticEvent, OfficeStation } from "./officeExperience.js";
import type { OfficeRuntimeVisualCommand } from "./officeVisualContract.js";

export class OfficeDirector {
  private snapshot: OfficeExperienceSnapshot | null = null;
  private reducedMotion = false;
  private pageHidden = false;
  private dispatchQueue: Promise<void> = Promise.resolve();
  private dispatchingChildId: string | null = null;
  private dispatchGeneration = 0;
  private readonly ambient: AmbientScheduler;
  private readonly activeAmbient = new Map<string, Promise<void>>();
  private readonly dispatchReservations = new Set<string>();

  constructor(
    private readonly engine: ChoreographyEngine,
    private readonly resolver: OfficeCalibrationResolver,
    private readonly behavior = new OfficeBehaviorPolicy(),
    clock?: OfficeClock,
    random?: RandomSource,
  ) {
    this.ambient = new AmbientScheduler((selection) => this.runAmbient(selection), clock, random);
  }

  sync(snapshot: OfficeExperienceSnapshot, events: readonly OfficeSemanticEvent[], reducedMotion: boolean): void {
    const previousSnapshot = this.snapshot;
    const priorContext = this.snapshot?.contextId;
    const reducedMotionChanged = this.reducedMotion !== reducedMotion;
    this.snapshot = snapshot;
    this.reducedMotion = reducedMotion;
    const contextChanged = priorContext != null && priorContext !== snapshot.contextId;
    if (contextChanged) this.resetChoreography(previousSnapshot);
    if (reducedMotionChanged) {
      if (reducedMotion) this.resetChoreography(previousSnapshot);
      for (const participant of snapshot.participants) void this.restoreAndApplySemantic(participant);
    }
    if (reducedMotion || snapshot.lifecycle === "terminal") this.ambient.sync(snapshot, false);
    const movedParticipants = new Set(events.filter((event) => event.kind === "station-changed").map((event) => event.participantId));

    for (const event of events) {
      if (event.kind === "scope-reset") {
        if (!contextChanged) this.resetChoreography(previousSnapshot);
        continue;
      }
      if (event.kind === "scope-terminal") {
        this.resetChoreography(previousSnapshot);
        for (const participant of snapshot.participants) void this.engine.run(participant.participantId, { kind: "parallel", commands: [
          { kind: "hideParticipant", participantId: participant.participantId },
          { kind: "setScreen", stationId: participant.stationId, profile: "off" },
          { kind: "setEffect", participantId: participant.participantId, effect: "none" },
        ] }, "semantic");
        continue;
      }
      if (event.kind === "participant-removed") {
        if (event.participantId === this.dispatchingChildId) {
          const main = snapshot.participants.find((candidate) => candidate.kind === "main");
          if (main) this.engine.cancelParticipant(main.participantId);
        }
        this.engine.cancelParticipant(event.participantId);
        void this.engine.run(event.participantId, { kind: "parallel", commands: [
          { kind: "hideParticipant", participantId: event.participantId },
          { kind: "setEffect", participantId: event.participantId, effect: "none" },
        ] }, "semantic");
        continue;
      }
      const participant = snapshot.participants.find((candidate) => candidate.participantId === event.participantId);
      if (!participant) continue;
      if (event.kind === "station-changed") {
        if (event.participantId === this.dispatchingChildId) {
          const main = snapshot.participants.find((candidate) => candidate.kind === "main");
          if (main) this.engine.cancelParticipant(main.participantId);
        }
        this.engine.cancelParticipant(participant.participantId);
        void this.restoreAndApplySemantic(participant, false, event.fromStationId);
        continue;
      }
      if (event.kind === "state-changed" && movedParticipants.has(participant.participantId)) continue;
      if (event.kind === "state-changed" && this.activeAmbient.has(participant.participantId)) {
        this.engine.cancelAmbient(participant.participantId);
        void this.restoreAndApplySemantic(participant, event.to === "completed");
        continue;
      }
      if (event.kind === "state-changed" && participant.participantId === this.dispatchingChildId) {
        if (participant.state === "attention" || participant.state === "blocked" || participant.state === "failed" || participant.state === "interrupted") {
          const main = snapshot.participants.find((candidate) => candidate.kind === "main");
          if (main) this.engine.cancelParticipant(main.participantId);
        }
        continue;
      }
      if (event.kind === "participant-added" && participant.kind === "child" && this.isMainParent(event.parentParticipantId)) {
        const contextId = snapshot.contextId;
        const generation = this.dispatchGeneration;
        this.dispatchQueue = this.dispatchQueue
          .catch(() => undefined)
          .then(() => this.runDispatch(participant.participantId, contextId, generation))
          .catch(() => undefined);
      } else {
        void this.restoreAndApplySemantic(participant, event.kind === "state-changed" && event.to === "completed");
      }
    }
    this.ambient.sync(snapshot, !reducedMotion && !this.pageHidden && snapshot.lifecycle === "active");
  }

  hydrate(snapshot: OfficeExperienceSnapshot, reducedMotion: boolean): void {
    this.snapshot = snapshot;
    this.reducedMotion = reducedMotion;
    for (const participant of snapshot.participants) void this.applySemantic(participant);
    this.ambient.sync(snapshot, !reducedMotion && snapshot.lifecycle === "active");
  }

  visibilityChanged(hidden: boolean): void {
    if (!this.snapshot) return;
    this.pageHidden = hidden;
    if (hidden) {
      this.ambient.sync(this.snapshot, false);
      this.resetChoreography(this.snapshot);
    } else {
      for (const participant of this.snapshot.participants) void this.restoreAndApplySemantic(participant);
      this.ambient.sync(this.snapshot, !this.reducedMotion && this.snapshot.lifecycle === "active");
    }
  }

  dispose(): void {
    this.dispatchGeneration += 1;
    this.ambient.dispose();
    this.engine.dispose();
  }

  private async applySemantic(participant: OfficeParticipant, celebrateCompleted = false): Promise<void> {
    await this.engine.run(participant.participantId, this.behavior.semantic(participant, celebrateCompleted), "semantic");
  }

  private async restoreAndApplySemantic(participant: OfficeParticipant, celebrateCompleted = false, previousStationId?: string): Promise<void> {
    const station = this.currentStation(participant.stationId);
    const commands: OfficeRuntimeVisualCommand[] = [];
    if (previousStationId && previousStationId !== participant.stationId) {
      commands.push({ kind: "setScreen", stationId: previousStationId, profile: "off" });
    }
    commands.push(positionFirstAction(
      this.behavior.semantic(participant, celebrateCompleted),
      participant.participantId,
      "canonical-seat",
      station.anchors.seat,
    ));
    await this.engine.run(participant.participantId, { kind: "sequence", commands: [
      ...commands,
    ] }, "semantic");
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
      await Promise.all([this.activeAmbient.get(reservedMainId), this.activeAmbient.get(reservedChildId)].filter((value): value is Promise<void> => Boolean(value)));
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
      const mainCommands: OfficeRuntimeVisualCommand[] = [
        { kind: "playAction", participantId: dispatchMain.participantId, actionId: "off-chair", loop: false, durationMs: this.resolver.action("off-chair").durationMs },
        ...route.outbound.map((stage) => stageCommand(dispatchMain.participantId, stage)),
        { kind: "parallel", commands: [
          positionedAction(dispatchMain.participantId, "handoff:standing-talk", "standing-talk", route.standingTalk, this.resolver.action("standing-talk").durationMs),
          positionedAction(dispatchChild.participantId, "handoff:seated-talk", "seated-talk", route.seatedTalk, this.resolver.action("seated-talk").durationMs),
        ] },
        positionedAction(dispatchChild.participantId, "handoff:salute", "salute", route.salute, this.resolver.action("salute").durationMs),
        ...route.return.map((stage) => stageCommand(dispatchMain.participantId, stage)),
        { kind: "playAction", participantId: dispatchMain.participantId, actionId: "off-chair", reverse: true, loop: false, durationMs: this.resolver.action("off-chair").durationMs },
      ];
      try {
        await this.engine.run(dispatchMain.participantId, { kind: "sequence", commands: mainCommands }, "semantic");
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

  private async runAmbient({ participant, action }: AmbientSelection): Promise<void> {
    const latest = this.snapshot?.participants.find((candidate) => candidate.participantId === participant.participantId);
    if (!latest || this.dispatchReservations.has(latest.participantId) || latest.participantId === this.dispatchingChildId || (latest.state !== "idle" && latest.state !== "completed") || this.reducedMotion || this.pageHidden) return;
    let finishAmbient!: () => void;
    const completion = new Promise<void>((resolve) => { finishAmbient = resolve; });
    this.activeAmbient.set(latest.participantId, completion);
    let command: OfficeRuntimeVisualCommand;
    if (action === "entertainment-1" || action === "entertainment-2") {
      command = { kind: "sequence", commands: [
        { kind: "parallel", commands: [
          { kind: "playAction", participantId: latest.participantId, actionId: "working", loop: true, durationMs: 5_000 },
          { kind: "setScreen", stationId: latest.stationId, profile: action, phase: stablePhase(latest.participantId) },
        ] },
      ] };
    } else if (action === "peek") {
      command = { kind: "playAction", participantId: latest.participantId, actionId: "peek", loop: false, durationMs: this.resolver.action("peek").durationMs };
    } else if (action === "desk-coffee") {
      command = { kind: "playAction", participantId: latest.participantId, actionId: "coffee-drink", loop: false, durationMs: this.resolver.action("coffee-drink").durationMs };
    } else {
      const stages = this.currentStation(latest.stationId).facilityRoutes[action];
      command = { kind: "sequence", commands: stages.map((stage) => stageCommand(latest.participantId, stage, action === "coffee" && stage.id === "facility-use")) };
    }
    try {
      await this.engine.run(latest.participantId, command, "ambient");
    } finally {
      const current = this.snapshot?.participants.find((candidate) => candidate.participantId === latest.participantId);
      if (current) await this.restoreAndApplySemantic(current);
      if (this.activeAmbient.get(latest.participantId) === completion) this.activeAmbient.delete(latest.participantId);
      finishAmbient();
    }
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

  private resetChoreography(previousSnapshot: OfficeExperienceSnapshot | null): void {
    this.dispatchGeneration += 1;
    this.dispatchingChildId = null;
    this.dispatchReservations.clear();
    this.activeAmbient.clear();
    this.engine.resetScope();
    for (const participant of previousSnapshot?.participants ?? []) {
      void this.engine.run(participant.participantId, { kind: "setEffect", participantId: participant.participantId, effect: "none" }, "semantic");
    }
  }
}

function stageCommand(participantId: string, stage: OfficeRouteStage, coffeeEffect = false): OfficeRuntimeVisualCommand {
  const commands: OfficeRuntimeVisualCommand[] = [
    {
      kind: "playRouteStage",
      participantId,
      routeId: stage.id,
      actionId: stage.actionId,
      points: stage.points,
      durationMs: stage.durationMs,
      loop: stage.points.length > 1,
      reverse: stage.reverse,
      flipX: stage.flipX,
    },
  ];
  if (coffeeEffect) commands.push({ kind: "setEffect", participantId, effect: "coffee-cup", durationMs: stage.durationMs });
  return commands.length === 1 ? commands[0]! : { kind: "parallel", commands };
}

function positionedAction(
  participantId: string,
  routeId: string,
  actionId: Extract<OfficeRuntimeVisualCommand, { kind: "playAction" }>["actionId"],
  point: { x: number; y: number },
  durationMs: number,
  command: Partial<Extract<OfficeRuntimeVisualCommand, { kind: "playAction" }>> = {},
): Extract<OfficeRuntimeVisualCommand, { kind: "playRouteStage" }> {
  return {
    kind: "playRouteStage",
    participantId,
    routeId,
    actionId,
    points: [point],
    durationMs,
    loop: command.loop,
    reverse: command.reverse,
    flipX: command.flipX,
  };
}

function positionFirstAction(
  command: OfficeRuntimeVisualCommand,
  participantId: string,
  routeId: string,
  point: { x: number; y: number },
): OfficeRuntimeVisualCommand {
  if (command.kind === "playAction" && command.participantId === participantId) {
    return positionedAction(participantId, routeId, command.actionId, point, command.durationMs ?? 0, command);
  }
  if (command.kind !== "sequence" && command.kind !== "parallel") return command;
  let positioned = false;
  const commands = command.commands.map((child) => {
    if (positioned) return child;
    const next = positionFirstAction(child, participantId, routeId, point);
    positioned = next !== child;
    return next;
  });
  return positioned ? { ...command, commands } : command;
}

function isDispatchBlocked(participant: OfficeParticipant): boolean {
  return participant.state === "attention" || participant.state === "blocked" || participant.state === "failed" || participant.state === "interrupted";
}
