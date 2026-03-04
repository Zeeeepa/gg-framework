import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../theme/theme.js";
import { Spinner } from "./Spinner.js";
import { Markdown } from "./Markdown.js";
import { ThinkingIndicator } from "./ThinkingIndicator.js";
import type { ActiveToolCall } from "../hooks/useAgentLoop.js";

const TOOL_NAMES: Record<string, string> = {
  bash: "Bash",
  read: "Read",
  write: "Write",
  edit: "Update",
  grep: "Search",
  find: "Find",
  ls: "List",
};

function formatActiveToolLabel(name: string, args: Record<string, unknown>): string {
  const display = TOOL_NAMES[name] ?? name;
  switch (name) {
    case "bash": {
      const cmd = String(args.command ?? "");
      const first = cmd.split("\n")[0];
      const trunc = first.length > 60 ? first.slice(0, 57) + "…" : first;
      return `${display}(${trunc}${cmd.includes("\n") ? " …" : ""})`;
    }
    case "read": {
      const fp = String(args.file_path ?? "");
      return `${display}(${fp.split("/").pop() ?? fp})`;
    }
    case "edit":
    case "write":
      return `${display}(${String(args.file_path ?? "")})`;
    case "grep":
      return `${display}(${String(args.pattern ?? "")})`;
    case "find":
      return `${display}(${String(args.pattern ?? "")})`;
    case "ls":
      return `${display}(${String(args.path ?? ".")})`;
    default:
      return display;
  }
}

interface StreamingAreaProps {
  isRunning: boolean;
  streamingText: string;
  streamingThinking: string;
  activeToolCalls: ActiveToolCall[];
  showThinking?: boolean;
  userMessage?: string;
}

export function StreamingArea({
  isRunning,
  streamingText,
  streamingThinking,
  activeToolCalls,
  showThinking = true,
  userMessage = "",
}: StreamingAreaProps) {
  const theme = useTheme();

  if (!isRunning && !streamingText) return null;

  return (
    <Box flexDirection="column" marginTop={1}>
      {isRunning && !streamingText && activeToolCalls.length === 0 && (
        <ThinkingIndicator userMessage={userMessage} />
      )}

      {showThinking && streamingThinking && (
        <Box marginBottom={1}>
          <Text color={theme.textDim} italic>
            {streamingThinking}
          </Text>
        </Box>
      )}

      {streamingText && (
        <Box>
          <Text color={theme.primary}>{"⏺ "}</Text>
          <Box flexDirection="column" flexShrink={1}>
            <Markdown>{streamingText}</Markdown>
          </Box>
        </Box>
      )}

      {activeToolCalls.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {activeToolCalls.map((tc) => {
            const displayName = formatActiveToolLabel(tc.name, tc.args);
            return (
              <Box key={tc.toolCallId}>
                <Spinner label={displayName} />
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
