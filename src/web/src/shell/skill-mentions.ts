import type { SkillListItem } from "../types.js";

export type SkillMentionResult = {
  cleanedText: string;
  skillIds: string[];
};

export type SkillMentionTrigger = {
  trigger: "/" | "$";
  query: string;
  start: number;
  end: number;
};

function normalizeToken(value: string): string {
  return value.trim().replace(/^[/$]+/, "").replace(/\s+/g, "-").toLowerCase();
}

function aliasCandidates(skill: SkillListItem): string[] {
  const rawValues = [skill.skillId, skill.name].filter(Boolean);
  const aliases: string[] = [];
  for (const rawValue of rawValues) {
    const raw = rawValue.trim().replace(/^[/$]+/, "");
    if (!raw) continue;
    const collapsed = raw.replace(/\s+/g, " ");
    aliases.push(
      raw,
      raw.replace(/\s+/g, "-"),
      raw.replace(/\s+/g, "_"),
      collapsed,
      collapsed.replace(/\s+/g, "-"),
      collapsed.replace(/\s+/g, "_"),
    );
  }
  return [...new Set(aliases)];
}

function buildAliasMap(skills: SkillListItem[]): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const skill of skills) {
    for (const alias of aliasCandidates(skill)) {
      aliases.set(normalizeToken(alias), skill.skillId);
    }
  }
  return aliases;
}

function maxAliasWordCount(aliasMap: Map<string, string>): number {
  let max = 1;
  for (const alias of aliasMap.keys()) {
    max = Math.max(max, alias.split("-").filter(Boolean).length);
  }
  return max;
}

export function extractInlineSkillMentions(text: string, skills: SkillListItem[]): SkillMentionResult {
  const aliasMap = buildAliasMap(skills);
  if (aliasMap.size === 0 || !/[/$]\S/.test(text)) {
    return { cleanedText: text, skillIds: [] };
  }
  const words = text.split(/\s+/).filter(Boolean);
  const consumed = new Set<number>();
  const skillIds: string[] = [];
  const seen = new Set<string>();
  const maxWords = maxAliasWordCount(aliasMap);

  for (let index = 0; index < words.length; index += 1) {
    if (consumed.has(index)) continue;
    const word = words[index] ?? "";
    if (!word.startsWith("/") && !word.startsWith("$")) continue;

    for (let count = maxWords; count >= 1; count -= 1) {
      const end = index + count;
      if (end > words.length) continue;
      const candidate = words.slice(index, end).join(" ");
      const skillId = aliasMap.get(normalizeToken(candidate));
      if (!skillId) continue;
      if (!seen.has(skillId)) {
        seen.add(skillId);
        skillIds.push(skillId);
      }
      for (let i = index; i < end; i += 1) consumed.add(i);
      break;
    }
  }

  if (consumed.size === 0) return { cleanedText: text, skillIds };
  return {
    cleanedText: words.filter((_, index) => !consumed.has(index)).join(" "),
    skillIds,
  };
}

export function findSkillMentionTrigger(text: string): SkillMentionTrigger | null {
  const match = /(^|\s)([/$])([^\s/$]*)$/.exec(text);
  if (!match || (match[2] !== "/" && match[2] !== "$")) return null;
  const prefixLength = match[1]?.length ?? 0;
  const triggerIndex = match.index + prefixLength;
  return {
    trigger: match[2],
    query: match[3] ?? "",
    start: triggerIndex,
    end: text.length,
  };
}

export function replaceSkillMentionTrigger(text: string, trigger: SkillMentionTrigger, skill: SkillListItem): string {
  const token = `/${skill.skillId}`;
  const before = text.slice(0, trigger.start);
  const after = text.slice(trigger.end);
  const separator = after.length === 0 || !/^\s/.test(after) ? " " : "";
  return `${before}${token}${separator}${after}`;
}

export function filterSkillMentionSuggestions(skills: SkillListItem[], query: string): SkillListItem[] {
  const normalizedQuery = normalizeToken(query);
  return skills
    .filter((skill) => {
      if (!normalizedQuery) return true;
      return aliasCandidates(skill).some((alias) => normalizeToken(alias).includes(normalizedQuery));
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);
}

export function uniqueSkillIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
