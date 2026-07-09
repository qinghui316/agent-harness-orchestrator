import type { ReactElement } from "react";
import { Sparkles, X } from "lucide-react";
import type { SkillListItem } from "../types.js";
import {
  filterSkillMentionSuggestions,
  findSkillMentionTrigger,
  replaceSkillMentionTrigger,
} from "./skill-mentions.js";

export function SkillMentionPicker({
  value,
  onChange,
  skills,
  activeSkillIds,
  onToggleSkill,
}: {
  value: string;
  onChange: (value: string) => void;
  skills: SkillListItem[];
  activeSkillIds: string[];
  onToggleSkill: (skillId: string) => void | Promise<void>;
}): ReactElement | null {
  if (skills.length === 0) return null;
  const trigger = findSkillMentionTrigger(value);
  const suggestions = trigger ? filterSkillMentionSuggestions(skills, trigger.query) : [];
  const activeSkills = skills.filter((skill) => activeSkillIds.includes(skill.skillId));

  return (
    <div className="skill-mention-surface" data-testid="skill-mention-surface">
      {activeSkills.length > 0 ? (
        <div className="skill-selected-row" aria-label="已选择技能">
          {activeSkills.map((skill) => (
            <button
              key={skill.skillId}
              type="button"
              className="skill-selected-chip"
              onClick={() => void onToggleSkill(skill.skillId)}
              title="从当前需求移除这个技能"
            >
              <Sparkles size={12} />
              {skill.name}
              <X size={12} />
            </button>
          ))}
        </div>
      ) : null}
      {trigger && suggestions.length > 0 ? (
        <div className="skill-mention-menu" role="listbox" aria-label="选择技能" data-testid="skill-mention-menu">
          {suggestions.map((skill) => {
            const target = skill.runtimeTargets.find((item) => item.provider === "codex");
            const syncState = target?.status ?? "not-synced";
            const active = activeSkillIds.includes(skill.skillId);
            return (
              <button
                key={skill.skillId}
                type="button"
                role="option"
                aria-selected={active}
                className={`skill-mention-option ${active ? "is-selected" : ""}`}
                onClick={() => {
                  onChange(replaceSkillMentionTrigger(value, trigger, skill));
                  if (!active) void onToggleSkill(skill.skillId);
                }}
              >
                <span className="skill-mention-option-main">
                  <strong>{skill.name}</strong>
                  <small>{skill.description || "无描述"}</small>
                </span>
                <span className={`skill-sync-state ${syncState}`}>{runtimeStatusLabel(syncState)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function runtimeStatusLabel(status: string): string {
  if (status === "native") return "Codex 可用";
  if (status === "synced") return "已同步";
  if (status === "out-of-sync") return "需要重新同步";
  return "需要同步";
}
