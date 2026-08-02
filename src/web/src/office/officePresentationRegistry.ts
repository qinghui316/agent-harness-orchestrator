import type {
  OfficeDeskActivityId,
  OfficeFacilityId,
  OfficeLeisureScreenId,
  OfficePresentationPreferences,
  OfficeScarfId,
  OfficeWeightedPreference,
} from "./officeExperience.js";

export type OfficeRolePresentation = {
  scarf: OfficeScarfId;
  preferences: OfficePresentationPreferences;
  avatarId: string;
};

type OfficeRolePresentationDefinition = {
  scarf: OfficeScarfId;
  preferredScreens?: readonly OfficeLeisureScreenId[];
  preferredDesk?: readonly OfficeDeskActivityId[];
  preferredFacilities?: readonly OfficeFacilityId[];
  avatarId: string;
};

const SCREENS: readonly OfficeLeisureScreenId[] = ["game-1", "game-2"];
const DESK_ACTIVITIES: readonly OfficeDeskActivityId[] = ["peek", "drink-at-desk"];
const FACILITIES: readonly OfficeFacilityId[] = ["coffee", "treadmill", "toilet"];

const DEFAULT_PRESENTATION: OfficeRolePresentationDefinition = {
  scarf: "default",
  avatarId: "default",
};

const PRESENTATIONS: Readonly<Record<string, OfficeRolePresentationDefinition>> = {
  "main-agent": { scarf: "main", preferredDesk: ["peek"], avatarId: "main-agent" },
  "planning-agent": { scarf: "planning", preferredDesk: ["peek"], preferredFacilities: ["coffee"], avatarId: "planning-agent" },
  "coder-agent": { scarf: "coder", preferredScreens: ["game-1"], preferredFacilities: ["treadmill"], avatarId: "coder-agent" },
  "auditor-agent": { scarf: "auditor", preferredScreens: ["game-2"], preferredDesk: ["peek"], avatarId: "auditor-agent" },
  "rework-coder": { scarf: "rework", preferredScreens: ["game-2"], preferredFacilities: ["treadmill"], avatarId: "rework-coder" },
  "spec-test-proposer": { scarf: "spec-test-proposer", preferredScreens: ["game-1"], preferredFacilities: ["coffee"], avatarId: "spec-test-proposer" },
  "spec-test-generator": { scarf: "spec-test-generator", preferredScreens: ["game-2"], preferredFacilities: ["coffee"], avatarId: "spec-test-generator" },
  "memory-maintenance-agent": { scarf: "maintenance", preferredScreens: ["game-2"], preferredFacilities: ["coffee", "toilet"], avatarId: "memory-maintenance-agent" },
  "harness-evolution-agent": { scarf: "evolution", preferredScreens: ["game-1"], preferredFacilities: ["treadmill", "toilet"], avatarId: "harness-evolution-agent" },
};

export function officePresentationForRole(roleId: string): OfficeRolePresentation {
  const presentation = PRESENTATIONS[roleId] ?? DEFAULT_PRESENTATION;
  return {
    scarf: presentation.scarf,
    avatarId: presentation.avatarId,
    preferences: {
      screens: weightedPreferences(SCREENS, presentation.preferredScreens),
      desk: weightedPreferences(DESK_ACTIVITIES, presentation.preferredDesk),
      facilities: weightedPreferences(FACILITIES, presentation.preferredFacilities),
    },
  };
}

export function officeAvatarIdForRole(roleId: string): string {
  return PRESENTATIONS[roleId]?.avatarId ?? DEFAULT_PRESENTATION.avatarId;
}

function weightedPreferences<T extends string>(
  ids: readonly T[],
  preferredIds: readonly T[] = [],
): OfficeWeightedPreference<T>[] {
  const preferred = new Set(preferredIds);
  return ids.map((id) => ({ id, weight: preferred.has(id) ? 3 : 1 }));
}
