/**
 * How much Claude Code may do without asking. The mode maps to the Agent SDK `permissionMode`
 * (see `RUNNER_SOURCE`). Every file change still goes through the Changes card, in all modes.
 */
export const AGENT_MODES = [
  {
    id: "manual",
    label: "Ask before edits",
    short: "Manual",
    description: "Asks before every file edit and every command.",
  },
  {
    id: "edits",
    label: "Edit automatically",
    short: "Edits",
    description: "Edits files without asking. Asks before commands.",
  },
  {
    id: "plan",
    label: "Plan mode",
    short: "Plan",
    description: "Reads and plans only. Changes nothing until you approve the plan.",
  },
  {
    id: "auto",
    label: "Auto",
    short: "Auto",
    description: "Never asks. Edits and commands run at once, inside the sandbox.",
  },
] as const;

export type AgentMode = (typeof AGENT_MODES)[number]["id"];

export const DEFAULT_AGENT_MODE: AgentMode = "edits";

export const isAgentMode = (v: unknown): v is AgentMode =>
  typeof v === "string" && AGENT_MODES.some((m) => m.id === v);

export const modeInfo = (id: AgentMode) => AGENT_MODES.find((m) => m.id === id)!;
