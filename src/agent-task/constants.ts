export const TERMINAL_REVIEW_WINDOW = 5;
export const WARM_CLOSEOUT_LIMIT = 30;

export const DOC_BUDGETS: Record<string, { soft: number; hard: number }> = {
  "AGENTS.md": { soft: 7000, hard: 11000 },
  "docs/STATUS.md": { soft: 5000, hard: 8000 },
  "docs/PRODUCT.md": { soft: 7000, hard: 11000 },
  "docs/AGENT-DEVELOPMENT-OS.md": { soft: 7000, hard: 11000 },
  "docs/ARCHITECTURE.md": { soft: 9000, hard: 14000 },
  "docs/RUNTIME.md": { soft: 9000, hard: 14000 },
  "docs/WORKBENCH.md": { soft: 7000, hard: 11000 },
  "docs/AGENT-MODEL.md": { soft: 8000, hard: 12000 },
  "docs/MEMORY.md": { soft: 6000, hard: 9000 },
};
