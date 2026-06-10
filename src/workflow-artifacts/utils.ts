export function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
