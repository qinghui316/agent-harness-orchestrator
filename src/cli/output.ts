export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printTable(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) {
    console.log("No records.");
    return;
  }
  console.table(rows);
}
