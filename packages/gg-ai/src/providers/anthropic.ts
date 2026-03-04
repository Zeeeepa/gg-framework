import Anthropic from "@anthropic-ai/sdk";
import type { ContentPart, StreamOptions, StreamResponse, ToolCall } from "../types.js";
import { ProviderError } from "../errors.js";
import { StreamResult } from "../utils/event-stream.js";
import {
  normalizeAnthropicStopReason,
  toAnthropicMessages,
  toAnthropicThinking,
  toAnthropicToolChoice,
  toAnthropicTools,
} from "./transform.js";

export function streamAnthropic(options: StreamOptions): StreamResult {
  const result = new StreamResult();
  runStream(options, result).catch((err) => result.abort(toError(err)));
  return result;
}

async function runStream(options: StreamOptions, result: StreamResult): Promise<void> {
  const isOAuth = options.apiKey?.startsWith("sk-ant-oat");
  const client = new Anthropic({
    ...(isOAuth
      ? { apiKey: null as unknown as string, authToken: options.apiKey }
      : { apiKey: options.apiKey }),
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    ...(isOAuth ? { defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" } } : {}),
  });

  const { system, messages } = toAnthropicMessages(options.messages);

  let maxTokens = options.maxTokens ?? 4096;
  let thinking: { type: "enabled"; budget_tokens: number } | undefined;

  if (options.thinking) {
    const t = toAnthropicThinking(options.thinking, maxTokens);
    thinking = t.thinking as { type: "enabled"; budget_tokens: number };
    maxTokens = t.maxTokens;
  }

  const params: Anthropic.MessageCreateParams = {
    model: options.model,
    max_tokens: maxTokens,
    messages,
    ...(system ? { system } : {}),
    ...(thinking ? { thinking } : {}),
    ...(options.temperature != null && !thinking ? { temperature: options.temperature } : {}),
    ...(options.topP != null ? { top_p: options.topP } : {}),
    ...(options.stop ? { stop_sequences: options.stop } : {}),
    ...(options.tools?.length ? { tools: toAnthropicTools(options.tools) } : {}),
    ...(options.toolChoice && options.tools?.length
      ? { tool_choice: toAnthropicToolChoice(options.toolChoice) }
      : {}),
    stream: true,
  };

  const stream = client.messages.stream(params, {
    signal: options.signal ?? undefined,
  });

  const contentParts: ContentPart[] = [];
  // Track the current tool call being streamed (by content block index)
  let currentToolId = "";
  let currentToolName = "";

  stream.on("text", (text) => {
    result.push({ type: "text_delta", text });
  });

  stream.on("thinking", (thinkingDelta) => {
    result.push({ type: "thinking_delta", text: thinkingDelta });
  });

  stream.on("streamEvent", (event) => {
    // When a new tool_use content block starts, capture its id and name
    if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
      currentToolId = event.content_block.id;
      currentToolName = event.content_block.name;
    }
  });

  stream.on("inputJson", (delta) => {
    result.push({
      type: "toolcall_delta",
      id: currentToolId,
      name: currentToolName,
      argsJson: delta,
    });
  });

  stream.on("contentBlock", (block) => {
    if (block.type === "text") {
      contentParts.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      contentParts.push({ type: "thinking", text: block.thinking });
    } else if (block.type === "tool_use") {
      const tc: ToolCall = {
        type: "tool_call",
        id: block.id,
        name: block.name,
        args: block.input as Record<string, unknown>,
      };
      contentParts.push(tc);
      result.push({
        type: "toolcall_done",
        id: tc.id,
        name: tc.name,
        args: tc.args,
      });
    }
  });

  try {
    const finalMessage = await stream.finalMessage();
    const stopReason = normalizeAnthropicStopReason(finalMessage.stop_reason);

    const response: StreamResponse = {
      message: {
        role: "assistant",
        content: contentParts.length > 0 ? contentParts : "",
      },
      stopReason,
      usage: {
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
      },
    };

    result.push({ type: "done", stopReason });
    result.complete(response);
  } catch (err) {
    const error = toError(err);
    result.push({ type: "error", error });
    result.abort(error);
  }
}

function toError(err: unknown): ProviderError {
  if (err instanceof Anthropic.APIError) {
    return new ProviderError("anthropic", err.message, {
      statusCode: err.status,
      cause: err,
    });
  }
  if (err instanceof Error) {
    return new ProviderError("anthropic", err.message, { cause: err });
  }
  return new ProviderError("anthropic", String(err));
}
