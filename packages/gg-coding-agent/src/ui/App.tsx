import React, { useState, useRef, useCallback, useEffect } from "react";
import { Box, Text, Static, useStdout } from "ink";
import type { Message, Provider, ThinkingLevel } from "@kenkaiiii/gg-ai";
import type { AgentTool } from "@kenkaiiii/gg-agent";
import { useAgentLoop } from "./hooks/useAgentLoop.js";
import { UserMessage } from "./components/UserMessage.js";
import { AssistantMessage } from "./components/AssistantMessage.js";
import { ToolExecution } from "./components/ToolExecution.js";
import { StreamingArea } from "./components/StreamingArea.js";
import { InputArea } from "./components/InputArea.js";
import { Footer } from "./components/Footer.js";
import { ModelSelector } from "./components/ModelSelector.js";
import { useTheme } from "./theme/theme.js";
import { getGitBranch } from "../utils/git.js";

// ── Completed Item Types ───────────────────────────────────

interface UserItem {
  kind: "user";
  text: string;
  id: string;
}

interface AssistantItem {
  kind: "assistant";
  text: string;
  thinking?: string;
  id: string;
}

interface ToolStartItem {
  kind: "tool_start";
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
  id: string;
}

interface ToolDoneItem {
  kind: "tool_done";
  name: string;
  args: Record<string, unknown>;
  result: string;
  isError: boolean;
  durationMs: number;
  id: string;
}

interface ErrorItem {
  kind: "error";
  message: string;
  id: string;
}

interface InfoItem {
  kind: "info";
  text: string;
  id: string;
}

interface DurationItem {
  kind: "duration";
  durationMs: number;
  toolsUsed: string[];
  id: string;
}

type CompletedItem =
  | UserItem
  | AssistantItem
  | ToolStartItem
  | ToolDoneItem
  | ErrorItem
  | InfoItem
  | DurationItem;

// ── Duration summary ─────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
}

function pickDurationVerb(toolsUsed: string[]): string {
  const has = (name: string) => toolsUsed.includes(name);

  // Tool-specific phrases (most specific first)
  if (has("edit") && has("write")) return "Crafted code for";
  if (has("edit")) return "Refactored for";
  if (has("write")) return "Wrote code for";
  if (has("bash") && has("grep")) return "Hacked away for";
  if (has("bash")) return "Executed commands for";
  if (has("grep") && has("read")) return "Investigated for";
  if (has("grep")) return "Searched for";
  if (has("read") && has("find")) return "Explored for";
  if (has("read")) return "Studied the code for";
  if (has("find") || has("ls")) return "Browsed files for";

  // No tools used — pure text response
  const phrases = [
    "Pondered for",
    "Thought for",
    "Reasoned for",
    "Mulled it over for",
    "Noodled on it for",
    "Brewed up a response in",
    "Cooked up an answer in",
    "Worked out a reply in",
    "Channeled wisdom for",
    "Conjured a response in",
  ];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ── App Props ──────────────────────────────────────────────

export interface AppProps {
  provider: Provider;
  model: string;
  tools: AgentTool[];
  messages: Message[];
  maxTokens: number;
  thinking?: ThinkingLevel;
  apiKey?: string;
  baseUrl?: string;
  accountId?: string;
  cwd: string;
  showThinking?: boolean;
  showTokenUsage?: boolean;
  onSlashCommand?: (input: string) => Promise<string | null>;
}

// ── App Component ──────────────────────────────────────────

export function App(props: AppProps) {
  const theme = useTheme();
  // Items scrolled into Static (history)
  const [history, setHistory] = useState<CompletedItem[]>([]);
  // Items from the current/last turn — rendered in the live area so they stay visible
  const [liveItems, setLiveItems] = useState<CompletedItem[]>([]);
  const [overlay, setOverlay] = useState<"model" | null>(null);
  const [lastUserMessage, setLastUserMessage] = useState("");
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const messagesRef = useRef<Message[]>(props.messages);
  const nextIdRef = useRef(0);

  const getId = () => String(nextIdRef.current++);

  // Load git branch
  useEffect(() => {
    getGitBranch(props.cwd).then(setGitBranch);
  }, [props.cwd]);

  const agentLoop = useAgentLoop(
    messagesRef,
    {
      provider: props.provider,
      model: props.model,
      tools: props.tools,
      maxTokens: props.maxTokens,
      thinking: props.thinking,
      apiKey: props.apiKey,
      baseUrl: props.baseUrl,
      accountId: props.accountId,
    },
    {
      onTurnText: useCallback((text: string, thinking: string) => {
        setLiveItems((prev) => [...prev, { kind: "assistant", text, thinking, id: getId() }]);
      }, []),
      onToolStart: useCallback(
        (toolCallId: string, name: string, args: Record<string, unknown>) => {
          setLiveItems((prev) => [
            ...prev,
            { kind: "tool_start", toolCallId, name, args, id: getId() },
          ]);
        },
        [],
      ),
      onToolEnd: useCallback(
        (
          toolCallId: string,
          name: string,
          result: string,
          isError: boolean,
          durationMs: number,
        ) => {
          setLiveItems((prev) => {
            // Find the matching tool_start and replace it with tool_done
            const startIdx = prev.findIndex(
              (item) => item.kind === "tool_start" && item.toolCallId === toolCallId,
            );
            if (startIdx !== -1) {
              const startItem = prev[startIdx] as ToolStartItem;
              const doneItem: ToolDoneItem = {
                kind: "tool_done",
                name,
                args: startItem.args,
                result,
                isError,
                durationMs,
                id: startItem.id,
              };
              const next = [...prev];
              next[startIdx] = doneItem;
              return next;
            }
            // Fallback: just append
            return [
              ...prev,
              { kind: "tool_done", name, args: {}, result, isError, durationMs, id: getId() },
            ];
          });
        },
        [],
      ),
      onDone: useCallback((durationMs: number, toolsUsed: string[]) => {
        setLiveItems((prev) => [...prev, { kind: "duration", durationMs, toolsUsed, id: getId() }]);
      }, []),
      onAborted: useCallback(() => {
        setLiveItems((prev) => [
          ...prev,
          { kind: "info", text: "Request was stopped.", id: getId() },
        ]);
      }, []),
    },
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      // Check slash commands
      if (props.onSlashCommand && input.startsWith("/")) {
        const result = await props.onSlashCommand(input);
        if (result !== null) {
          setLiveItems((prev) => [...prev, { kind: "info", text: result, id: getId() }]);

          if (input.trim() === "/model" || input.trim() === "/m") {
            setOverlay("model");
          }
          return;
        }
      }

      // Move current live items into history (Static) before starting new turn
      setLiveItems((prev) => {
        if (prev.length > 0) {
          setHistory((h) => [...h, ...prev]);
        }
        return [];
      });

      // Add user message to live area
      const userItem: UserItem = { kind: "user", text: input, id: getId() };
      setLastUserMessage(input);
      setLiveItems([userItem]);

      // Run agent
      try {
        await agentLoop.run(input);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isAbort = msg.includes("aborted") || msg.includes("abort");
        setLiveItems((prev) => [
          ...prev,
          isAbort
            ? { kind: "info", text: "Request was stopped.", id: getId() }
            : { kind: "error", message: msg, id: getId() },
        ]);
      }
    },
    [agentLoop, props.onSlashCommand],
  );

  const handleAbort = useCallback(() => {
    if (agentLoop.isRunning) {
      agentLoop.abort();
    } else {
      process.exit(0);
    }
  }, [agentLoop]);

  const handleModelSelect = useCallback((value: string) => {
    setOverlay(null);
    const [_provider, _model] = value.split(":");
    setLiveItems((prev) => [...prev, { kind: "info", text: `Switched to ${value}`, id: getId() }]);
  }, []);

  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 24;

  const renderItem = (item: CompletedItem) => {
    switch (item.kind) {
      case "user":
        return <UserMessage key={item.id} text={item.text} />;
      case "assistant":
        return (
          <AssistantMessage
            key={item.id}
            text={item.text}
            thinking={item.thinking}
            showThinking={props.showThinking}
          />
        );
      case "tool_start":
        return <ToolExecution key={item.id} status="running" name={item.name} args={item.args} />;
      case "tool_done":
        return (
          <ToolExecution
            key={item.id}
            status="done"
            name={item.name}
            args={item.args}
            result={item.result}
            isError={item.isError}
          />
        );
      case "error":
        return (
          <Box key={item.id} marginTop={1}>
            <Text color={theme.error}>{"✗ "}</Text>
            <Text color={theme.error}>{item.message}</Text>
          </Box>
        );
      case "info":
        return (
          <Box key={item.id} marginTop={1}>
            <Text color={theme.textDim}>{item.text}</Text>
          </Box>
        );
      case "duration":
        return (
          <Box key={item.id} marginTop={1}>
            <Text color={theme.textDim}>
              {"✻ "}
              {pickDurationVerb(item.toolsUsed)} {formatDuration(item.durationMs)}
            </Text>
          </Box>
        );
    }
  };

  return (
    <Box flexDirection="column" minHeight={terminalHeight}>
      {/* History — scrolled up, managed by Ink Static */}
      <Static items={history}>{(item) => renderItem(item)}</Static>

      {/* Content area — fills remaining space */}
      <Box flexDirection="column" flexGrow={1}>
        {/* Live items — current/last turn, stays visible */}
        {liveItems.map((item) => renderItem(item))}

        {/* Streaming area */}
        <StreamingArea
          isRunning={agentLoop.isRunning}
          streamingText={agentLoop.streamingText}
          streamingThinking={agentLoop.streamingThinking}
          activeToolCalls={agentLoop.activeToolCalls}
          showThinking={props.showThinking}
          userMessage={lastUserMessage}
        />

        {/* Overlay */}
        {overlay === "model" && (
          <ModelSelector onSelect={handleModelSelect} onCancel={() => setOverlay(null)} />
        )}
      </Box>

      {/* Input + Footer pinned at bottom */}
      <InputArea onSubmit={handleSubmit} onAbort={handleAbort} disabled={agentLoop.isRunning} />
      <Footer
        model={props.model}
        tokensIn={agentLoop.totalTokens.input}
        cwd={props.cwd}
        gitBranch={gitBranch}
      />
    </Box>
  );
}
