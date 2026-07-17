export function cleanTranscriptTitle(value?: string): string | undefined {
  const text = cleanTranscriptText(value ?? "");
  if (!text || text === "AI" || text === "AI 回复" || text === "执行结果") return undefined;
  if (text === "Command completed") return "命令已完成";
  if (text === "Command started") return "正在运行命令";
  if (text === "Command failed") return "命令执行失败";
  return text;
}

export function cleanTranscriptText(value?: string): string {
  return (value ?? "").trim();
}
