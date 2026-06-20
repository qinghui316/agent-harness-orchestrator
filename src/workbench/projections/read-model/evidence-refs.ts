export function evidenceRefs(...refs: Array<string | null | undefined>): string[] {
  return refs.filter((ref): ref is string => Boolean(ref));
}
