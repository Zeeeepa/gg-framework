import React from "react";
import { Text, Box } from "ink";
import { useTheme } from "../theme/theme.js";

export function UserMessage({ text }: { text: string }) {
  const theme = useTheme();

  return (
    <Box marginTop={1}>
      <Text color={theme.inputPrompt}>{"❯ "}</Text>
      <Box flexShrink={1}>
        <Text color={theme.textMuted}>{text}</Text>
      </Box>
    </Box>
  );
}
