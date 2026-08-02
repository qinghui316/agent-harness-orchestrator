const PORTABLE_PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function isPortableProjectId(value: string): boolean {
  return PORTABLE_PROJECT_ID.test(value);
}

export function assertPortableProjectId(value: string, label = "project id"): string {
  if (!isPortableProjectId(value)) {
    throw new Error(`${label} is not portable: ${value}`);
  }
  return value;
}
