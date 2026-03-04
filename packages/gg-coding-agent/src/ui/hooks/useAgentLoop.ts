import { useState, useRef, useCallback, useEffect } from "react";
import { agentLoop, type AgentEvent, type AgentTool } from "@kenkaiiii/gg-agent";
import type { Message, Provider, ThinkingLevel } from "@kenkaiiii/gg-ai";

export interface ActiveToolCall {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  startTime: number;
}

export interface AgentLoopOptions {
  provider: Provider;
  model: string;
  tools: AgentTool[];
  maxTokens: number;
  thinking?: ThinkingLevel;
  apiKey?: string;
  baseUrl?: string;
  accountId?: string;
}

export interface UseAgentLoopReturn {
  run: (userContent: string) => Promise<void>;
  abort: () => void;
  isRunning: boolean;
  streamingText: string;
  streamingThinking: string;
  activeToolCalls: ActiveToolCall[];
  currentTurn: number;
  totalTokens: { input: number; output: number };
}

export function useAgentLoop(
  messages: React.MutableRefObject<Message[]>,
  options: AgentLoopOptions,
  callbacks?: {
    onComplete?: (newMessages: Message[]) => void;
    onTurnText?: (text: string, thinking: string) => void;
    onToolStart?: (toolCallId: string, name: string, args: Record<string, unknown>) => void;
    onToolEnd?: (
      toolCallId: string,
      name: string,
      result: string,
      isError: boolean,
      durationMs: number,
    ) => void;
    onDone?: (durationMs: number, toolsUsed: string[]) => void;
    onAborted?: () => void;
  },
): UseAgentLoopReturn {
  const onComplete = callbacks?.onComplete;
  const onTurnText = callbacks?.onTurnText;
  const onToolStart = callbacks?.onToolStart;
  const onToolEnd = callbacks?.onToolEnd;
  const onDone = callbacks?.onDone;
  const onAborted = callbacks?.onAborted;
  const [isRunning, setIsRunning] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([]);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [totalTokens, setTotalTokens] = useState({ input: 0, output: 0 });

  const abortRef = useRef<AbortController | null>(null);
  const activeToolCallsRef = useRef<ActiveToolCall[]>([]);
  const textPendingRef = useRef("");
  const textVisibleRef = useRef("");
  const thinkingBufferRef = useRef("");
  const runStartRef = useRef(0);
  const toolsUsedRef = useRef<Set<string>>(new Set());
  const revealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopReveal = useCallback(() => {
    if (revealTimerRef.current) {
      clearInterval(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  const startReveal = useCallback(() => {
    if (revealTimerRef.current) return;
    revealTimerRef.current = setInterval(() => {
      const pending = textPendingRef.current;
      if (pending.length === 0) return;

      // Adaptive speed: reveal more chars when buffer is large
      const buffered = pending.length;
      let charsPerTick: number;
      if (buffered > 500) charsPerTick = 20;
      else if (buffered > 200) charsPerTick = 10;
      else if (buffered > 50) charsPerTick = 4;
      else charsPerTick = 2;

      const reveal = pending.slice(0, charsPerTick);
      textPendingRef.current = pending.slice(charsPerTick);
      textVisibleRef.current += reveal;
      setStreamingText(textVisibleRef.current);
    }, 12);
  }, []);

  const flushAllText = useCallback(() => {
    stopReveal();
    if (textPendingRef.current.length > 0) {
      textVisibleRef.current += textPendingRef.current;
      textPendingRef.current = "";
    }
    setStreamingText(textVisibleRef.current);
    setStreamingThinking(thinkingBufferRef.current);
  }, [stopReveal]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const run = useCallback(
    async (userContent: string) => {
      const ac = new AbortController();
      abortRef.current = ac;
      let wasAborted = false;

      // Reset state
      textPendingRef.current = "";
      textVisibleRef.current = "";
      thinkingBufferRef.current = "";
      runStartRef.current = Date.now();
      toolsUsedRef.current = new Set();
      setStreamingText("");
      setStreamingThinking("");
      setActiveToolCalls([]);
      setIsRunning(true);

      // Push user message
      const userMsg: Message = { role: "user", content: userContent };
      messages.current.push(userMsg);
      const startIndex = messages.current.length;

      try {
        const generator = agentLoop(messages.current, {
          provider: options.provider,
          model: options.model,
          tools: options.tools,
          maxTokens: options.maxTokens,
          thinking: options.thinking,
          apiKey: options.apiKey,
          baseUrl: options.baseUrl,
          accountId: options.accountId,
          signal: ac.signal,
        });

        for await (const event of generator as AsyncIterable<AgentEvent>) {
          switch (event.type) {
            case "text_delta":
              textPendingRef.current += event.text;
              startReveal();
              break;

            case "thinking_delta":
              thinkingBufferRef.current += event.text;
              setStreamingThinking(thinkingBufferRef.current);
              break;

            case "tool_call_start": {
              const newTc: ActiveToolCall = {
                toolCallId: event.toolCallId,
                name: event.name,
                args: event.args,
                startTime: Date.now(),
              };
              onToolStart?.(event.toolCallId, event.name, event.args);
              toolsUsedRef.current.add(event.name);
              activeToolCallsRef.current = [...activeToolCallsRef.current, newTc];
              setActiveToolCalls(activeToolCallsRef.current);
              break;
            }

            case "tool_call_end": {
              const tc = activeToolCallsRef.current.find((t) => t.toolCallId === event.toolCallId);
              const toolName = tc?.name ?? "unknown";
              const durationMs = tc ? Date.now() - tc.startTime : 0;
              onToolEnd?.(event.toolCallId, toolName, event.result, event.isError, durationMs);
              activeToolCallsRef.current = activeToolCallsRef.current.filter(
                (t) => t.toolCallId !== event.toolCallId,
              );
              setActiveToolCalls(activeToolCallsRef.current);
              break;
            }

            case "turn_end":
              setCurrentTurn(event.turn);
              setTotalTokens((prev) => ({
                input: prev.input + event.usage.inputTokens,
                output: prev.output + event.usage.outputTokens,
              }));
              // Flush all pending text before completing turn
              flushAllText();
              if (textVisibleRef.current) {
                onTurnText?.(textVisibleRef.current, thinkingBufferRef.current);
              }
              // Reset streaming buffers for next turn
              textPendingRef.current = "";
              textVisibleRef.current = "";
              thinkingBufferRef.current = "";
              setStreamingText("");
              setStreamingThinking("");
              break;

            case "agent_done":
              flushAllText();
              break;
          }
        }
      } catch (err) {
        const isAbort =
          err instanceof Error && (err.name === "AbortError" || err.message.includes("aborted"));
        if (!isAbort) {
          throw err;
        }
        wasAborted = true;
      } finally {
        setIsRunning(false);
        abortRef.current = null;
        stopReveal();

        if (wasAborted) {
          onAborted?.();
        } else {
          // Notify parent of duration + tools used
          const durationMs = Date.now() - runStartRef.current;
          onDone?.(durationMs, [...toolsUsedRef.current]);
        }

        // Notify parent of new messages
        const newMsgs = messages.current.slice(startIndex);
        onComplete?.(newMsgs);
      }
    },
    [
      messages,
      options,
      onComplete,
      onTurnText,
      onToolStart,
      onToolEnd,
      onDone,
      onAborted,
      startReveal,
      stopReveal,
      flushAllText,
    ],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopReveal();
      abortRef.current?.abort();
    };
  }, [stopReveal]);

  return {
    run,
    abort,
    isRunning,
    streamingText,
    streamingThinking,
    activeToolCalls,
    currentTurn,
    totalTokens,
  };
}
