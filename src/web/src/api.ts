export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function consumeWorkbenchLiveStream<TEvent>(url: string, body: unknown, onEvent: (event: TEvent) => void): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  if (!response.body) throw new Error("Live response did not include a readable body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n\n");
    while (index !== -1) {
      const frame = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = parseWorkbenchSseFrame<TEvent>(frame);
      if (event) onEvent(event);
      await yieldToBrowser();
      index = buffer.indexOf("\n\n");
    }
  }
  const trailing = buffer.trim();
  if (trailing) {
    const event = parseWorkbenchSseFrame<TEvent>(trailing);
    if (event) onEvent(event);
    await yieldToBrowser();
  }
}

function parseWorkbenchSseFrame<TEvent>(frame: string): TEvent | null {
  if (!frame.trim() || frame.trim().startsWith(":")) return null;
  let eventName = "";
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) eventName = line.slice("event:".length).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trimStart());
  }
  if (!eventName || dataLines.length === 0) return null;
  return { event: eventName, data: JSON.parse(dataLines.join("\n")) } as TEvent;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
