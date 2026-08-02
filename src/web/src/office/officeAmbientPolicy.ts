import type {
  OfficeAmbientIntent,
  OfficeExperienceSnapshot,
  OfficeFacilityId,
  OfficePresentationPreferences,
  OfficeWeightedPreference,
} from "./officeExperience.js";

export type OfficeAmbientActor = {
  actorId: string;
  actorKind: "participant" | "resident";
  identityKey: string;
  preferences: OfficePresentationPreferences;
};

export class OfficeAmbientPolicy {
  eligibleActors(snapshot: OfficeExperienceSnapshot | null): OfficeAmbientActor[] {
    if (!snapshot) return [];
    const participants = snapshot.lifecycle === "active"
      ? snapshot.participants.filter((participant) => participant.state === "idle" || participant.state === "completed")
      : [];
    return [
      ...participants.map((participant): OfficeAmbientActor => ({
        actorId: participant.participantId,
        actorKind: "participant",
        identityKey: `participant:${participant.participantId}:${participant.createdAt}`,
        preferences: participant.presentationPreferences,
      })),
      ...snapshot.residents.map((resident): OfficeAmbientActor => ({
        actorId: resident.residentId,
        actorKind: "resident",
        identityKey: `resident:${resident.residentId}:${resident.roleId}`,
        preferences: resident.presentationPreferences,
      })),
    ].sort((left, right) => left.actorId.localeCompare(right.actorId));
  }

  actor(snapshot: OfficeExperienceSnapshot | null, actorId: string): OfficeAmbientActor | null {
    return this.eligibleActors(snapshot).find((actor) => actor.actorId === actorId) ?? null;
  }

  chooseFacility(
    actor: OfficeAmbientActor,
    available: ReadonlySet<OfficeFacilityId>,
    randomValue: number,
  ): OfficeFacilityId | null {
    return weightedPick(actor.preferences.facilities.filter((item) => available.has(item.id)), randomValue);
  }

  chooseDesk(
    actors: readonly OfficeAmbientActor[],
    unavailableActorIds: ReadonlySet<string>,
    randomValue: number,
  ): { actor: OfficeAmbientActor; intent: Extract<OfficeAmbientIntent, { kind: "desk" }> } | null {
    const choices = actors
      .filter((actor) => !unavailableActorIds.has(actor.actorId))
      .flatMap((actor) => actor.preferences.desk.map((preference) => ({ actor, preference })))
      .sort((left, right) => left.actor.actorId.localeCompare(right.actor.actorId));
    const selected = weightedPickItem(choices, (choice) => choice.preference.weight, randomValue);
    return selected ? { actor: selected.actor, intent: { kind: "desk", activity: selected.preference.id } } : null;
  }

  chooseLookAround(
    actors: readonly OfficeAmbientActor[],
    unavailableActorIds: ReadonlySet<string>,
    randomValue: number,
  ): OfficeAmbientActor | null {
    const candidates = actors.filter((actor) => !unavailableActorIds.has(actor.actorId));
    if (candidates.length === 0) return null;
    return candidates[Math.min(candidates.length - 1, Math.floor(clampRandom(randomValue) * candidates.length))] ?? null;
  }
}

function weightedPick<T extends string>(preferences: readonly OfficeWeightedPreference<T>[], randomValue: number): T | null {
  return weightedPickItem(preferences, (preference) => preference.weight, randomValue)?.id ?? null;
}

function weightedPickItem<T>(items: readonly T[], weight: (item: T) => number, randomValue: number): T | null {
  const positive = items.filter((item) => weight(item) > 0);
  const total = positive.reduce((sum, item) => sum + weight(item), 0);
  if (total <= 0) return null;
  let cursor = clampRandom(randomValue) * total;
  for (const item of positive) {
    cursor -= weight(item);
    if (cursor < 0) return item;
  }
  return positive.at(-1) ?? null;
}

function clampRandom(value: number): number {
  return Math.min(0.999999999999, Math.max(0, value));
}
