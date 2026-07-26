export function commitLatestOfficeRender<T>(
  generation: number,
  currentGeneration: number,
  result: T,
  commit: (value: T) => void,
  discard: (value: T) => void,
): boolean {
  if (generation !== currentGeneration) {
    discard(result);
    return false;
  }
  commit(result);
  return true;
}
