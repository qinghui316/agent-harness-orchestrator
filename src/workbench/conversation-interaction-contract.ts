import type { ProductMode } from "../provider-runtime/index.js";

export type ConversationQuestionInputMode = "single" | "multiple" | "text" | "secret";

export interface ConversationInteractionOption {
  value: string;
  label: string;
  description?: string;
}

export interface ConversationInteractionQuestion {
  questionId: string;
  title: string;
  inputMode: ConversationQuestionInputMode;
  options: ConversationInteractionOption[];
  allowCustom: boolean;
}

interface ConversationInteractionBase {
  interactionId: string;
  conversationId: string;
  graphScopeId: string;
  canonicalSequence: number;
  status: "pending" | "submitting";
  questions: ConversationInteractionQuestion[];
  canSkip: boolean;
}

export interface PlanConversationInteraction extends ConversationInteractionBase {
  kind: "plan";
  title: string;
}

export interface ProviderInputConversationInteraction extends ConversationInteractionBase {
  kind: "provider-input";
  title: string;
}

export interface ClarificationConversationInteraction extends ConversationInteractionBase {
  kind: "clarification";
  title: string;
}

export type ConversationInteraction =
  | PlanConversationInteraction
  | ProviderInputConversationInteraction
  | ClarificationConversationInteraction;

export interface ConversationInteractionQueue {
  productMode: ProductMode;
  conversationId?: string;
  graphScopeId?: string;
  items: ConversationInteraction[];
}

export interface ConversationInteractionSettlement {
  action: "answer" | "skip" | "execute-plan" | "revise-plan";
  answers?: Record<string, string | string[]>;
  skippedQuestionIds?: string[];
  feedback?: string;
}

export interface InteractionHistoryRecord {
  kind: "provider-input" | "clarification" | "plan";
  status: "pending" | "submitting" | "answered" | "skipped" | "interrupted" | "superseded";
  questions?: Array<{ questionId: string; title: string }>;
  answers?: Record<string, string | string[]>;
  skippedQuestionIds?: string[];
}
