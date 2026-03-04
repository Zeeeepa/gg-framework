import type { z } from "zod";
import type { Tool, AssistantMessage, StopReason, Usage, StreamOptions } from "@kenkaiiii/gg-ai";

// ── Tool Context ────────────────────────────────────────────

export interface ToolContext {
  signal: AbortSignal;
  toolCallId: string;
}

// ── Agent Tool ──────────────────────────────────────────────

export interface AgentTool<T extends z.ZodType = z.ZodType> extends Tool {
  parameters: T;
  execute: (args: z.infer<T>, context: ToolContext) => string | Promise<string>;
}

// ── Agent Events ────────────────────────────────────────────

export interface AgentTextDeltaEvent {
  type: "text_delta";
  text: string;
}

export interface AgentThinkingDeltaEvent {
  type: "thinking_delta";
  text: string;
}

export interface AgentToolCallStartEvent {
  type: "tool_call_start";
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentToolCallEndEvent {
  type: "tool_call_end";
  toolCallId: string;
  result: string;
  isError: boolean;
  durationMs: number;
}

export interface AgentTurnEndEvent {
  type: "turn_end";
  turn: number;
  stopReason: StopReason;
  usage: Usage;
}

export interface AgentDoneEvent {
  type: "agent_done";
  totalTurns: number;
  totalUsage: Usage;
}

export interface AgentErrorEvent {
  type: "error";
  error: Error;
}

export type AgentEvent =
  | AgentTextDeltaEvent
  | AgentThinkingDeltaEvent
  | AgentToolCallStartEvent
  | AgentToolCallEndEvent
  | AgentTurnEndEvent
  | AgentDoneEvent
  | AgentErrorEvent;

// ── Agent Options ───────────────────────────────────────────

export interface AgentOptions {
  provider: StreamOptions["provider"];
  model: string;
  system?: string;
  tools?: AgentTool[];
  maxTurns?: number;
  maxTokens?: number;
  temperature?: number;
  thinking?: StreamOptions["thinking"];
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  accountId?: string;
}

// ── Agent Result ────────────────────────────────────────────

export interface AgentResult {
  message: AssistantMessage;
  totalTurns: number;
  totalUsage: Usage;
}
