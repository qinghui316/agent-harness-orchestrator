export function removeOfficeTickerIfCurrent<T>(
  app: { ticker: { remove(callback: T): void } },
  currentApp: unknown,
  ticker: T,
  currentTicker: T | null,
): boolean {
  if (currentApp !== app || currentTicker !== ticker) return false;
  app.ticker.remove(ticker);
  return true;
}
