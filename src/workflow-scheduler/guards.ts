interface SchedulerArtifactWithId {
  id: string;
}

export function assertLatestSchedulerArtifact<T extends SchedulerArtifactWithId>(
  latest: T | null | undefined,
  target: SchedulerArtifactWithId,
  artifactName: string,
  targetName: string,
): asserts latest is T {
  if (!latest || latest.id !== target.id) throw new Error(`${artifactName} requires the latest ${targetName}.`);
}
