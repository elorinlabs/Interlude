export interface ThreadGoal {
  threadId: string;
  objective: string;
  status: "active" | "paused" | "blocked" | "usageLimited" | "budgetLimited" | "complete";
  tokenBudget: number | null;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export const GOAL_STATUS: Record<ThreadGoal["status"], string> = {
  active: "client.chat.inProgress", paused: "client.downloads.paused", blocked: "client.chat.needsHelp", usageLimited: "client.chat.usageLimitReached",
  budgetLimited: "client.chat.budgetExhausted", complete: "client.chat.completed",
};
