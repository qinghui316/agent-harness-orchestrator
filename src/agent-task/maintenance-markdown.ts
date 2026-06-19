export interface MaintenanceMarkdownListOptions {
  emptyLabel?: string;
}

export function renderMaintenanceMarkdownList(
  items: string[],
  options: MaintenanceMarkdownListOptions = {},
): string[] {
  if (items.length > 0) return items.map((item) => `- ${item}`);
  return options.emptyLabel ? [`- ${options.emptyLabel}`] : [];
}

export function renderMaintenanceMarkdownDetailItem(label: string, details: string[]): string[] {
  return [
    `- ${label}`,
    ...details.map((detail) => `  ${detail}`),
  ];
}
