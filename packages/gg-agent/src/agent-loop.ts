import {
  stream,
  type Message,
  type ToolCall,
  type ToolResult,
  type Usage,
  type ContentPart,
  type AssistantMessage,
} from "@kenkaiiii/gg-ai";
import type { AgentEvent, AgentOptions, AgentResult, AgentTool, ToolContext } from "./types.js";

const DEFAULT_MAX_TURNS = 40;

export async function* agentLoop(
  messages: Message[],
  options: AgentOptions,
): AsyncGenerator<AgentEvent, AgentResult> {
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  const toolMap = new Map<string, AgentTool>((options.tools ?? []).map((t) => [t.name, t]));

  const totalUsage: Usage = { inputTokens: 0, outputTokens: 0 };
  let turn = 0;

  while (turn < maxTurns) {
    options.signal?.throwIfAborted();
    turn++;

    const result = stream({
      provider: options.provider,
      model: options.model,
      messages,
      tools: options.tools,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      thinking: options.thinking,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      signal: options.signal,
      accountId: options.accountId,
    });

    // Suppress unhandled rejection if the iterator path throws first
    result.response.catch(() => {});

    // Forward streaming deltas
    for await (const event of result) {
      if (event.type === "text_delta") {
        yield { type: "text_delta" as const, text: event.text };
      } else if (event.type === "thinking_delta") {
        yield { type: "thinking_delta" as const, text: event.text };
      }
    }

    const response = await result.response;

    // Accumulate usage
    totalUsage.inputTokens += response.usage.inputTokens;
    totalUsage.outputTokens += response.usage.outputTokens;

    // Append assistant message to conversation
    messages.push(response.message);

    yield {
      type: "turn_end" as const,
      turn,
      stopReason: response.stopReason,
      usage: response.usage,
    };

    // If not tool_use, we're done
    if (response.stopReason !== "tool_use") {
      yield {
        type: "agent_done" as const,
        totalTurns: turn,
        totalUsage: { ...totalUsage },
      };
      return {
        message: response.message,
        totalTurns: turn,
        totalUsage: { ...totalUsage },
      };
    }

    // Extract and execute tool calls
    const toolCalls = extractToolCalls(response.message.content);
    const toolResults: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      options.signal?.throwIfAborted();

      yield {
        type: "tool_call_start" as const,
        toolCallId: toolCall.id,
        name: toolCall.name,
        args: toolCall.args,
      };

      const startTime = Date.now();
      let resultContent: string;
      let isError = false;

      const tool = toolMap.get(toolCall.name);
      if (!tool) {
        resultContent = `Unknown tool: ${toolCall.name}`;
        isError = true;
      } else {
        try {
          const parsed = tool.parameters.parse(toolCall.args);
          const ctx: ToolContext = {
            signal: options.signal ?? AbortSignal.timeout(300_000),
            toolCallId: toolCall.id,
          };
          resultContent = await tool.execute(parsed, ctx);
        } catch (err) {
          isError = true;
          resultContent = err instanceof Error ? err.message : String(err);
        }
      }

      const durationMs = Date.now() - startTime;

      yield {
        type: "tool_call_end" as const,
        toolCallId: toolCall.id,
        result: resultContent,
        isError,
        durationMs,
      };

      toolResults.push({
        type: "tool_result",
        toolCallId: toolCall.id,
        content: resultContent,
        isError: isError || undefined,
      });
    }

    // Push tool results back into conversation
    messages.push({ role: "tool", content: toolResults });
  }

  // Exceeded max turns — return last assistant message
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant") as AssistantMessage;

  yield {
    type: "agent_done" as const,
    totalTurns: turn,
    totalUsage: { ...totalUsage },
  };

  return {
    message: lastAssistant,
    totalTurns: turn,
    totalUsage: { ...totalUsage },
  };
}

function extractToolCalls(content: string | ContentPart[]): ToolCall[] {
  if (typeof content === "string") return [];
  return content.filter((part): part is ToolCall => part.type === "tool_call");
}
